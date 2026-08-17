import { ChatRequest } from "../Model/ChatRequest";
import { User, McpServer } from "@prisma/client";
import { ChatService } from "./ChatService";
import { MemoryService, MAX_MEMORY_FETCH_LOOPS } from "./MemoryService";
import { BillingApi, INSUFFICIENT_BALANCE_CODE } from "../Api/BillingApi";
import { ConversationApi, hasPdfArtifact } from "../Api/ConversationApi";
import {
  AIProvider,
  getDefaultModel,
  modelSupportsDocuments,
} from "../LLM/Model/AIProvider";
import { StreamChunk } from "../LLM/AIWrapper";
import { ToolRegistry } from "../Tools/ToolRegistry";
import { drainMemoryOps } from "../Tools/MemoryTool";
import { getMcpClientManager } from "../Tools/McpClientManager";
import { getDbContext } from "../Entity/Database";
import { serverLog } from "./ServerLogService";
import { SentimentService, SentimentSummary } from "./SentimentService";
import {
  extractImageRefs,
  buildImageMarkdown,
  summarizeImageToolResult,
} from "./ImageSanitizer";
import { resolvePromptListItem } from "../LLM/prompts/promptlist";
import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/index";

/** Maximum number of backend tool execution iterations before stopping */
const MAX_TOOL_LOOP_ITERATIONS = 10;

/**
 * Higher iteration cap for agentic commands (e.g. /goal): the model is allowed
 * many self-directed tool/distill steps before producing a final answer.
 */
const MAX_AGENTIC_LOOP_ITERATIONS = 50;

/**
 * Strip tool_result messages whose tool_call_id has no matching tool_use on
 * the immediately preceding assistant message, and drop tool_calls on the
 * preceding assistant message that have no matching tool_result right after.
 *
 * Anthropic requires that each tool_result block have a corresponding tool_use
 * block in the previous message. Historical chats created before the
 * tool_calls field was stored on assistant messages would otherwise keep
 * failing with "unexpected tool_use_id found in tool_result blocks".
 */
function sanitizeToolMessages(
  prompts: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  const out: ChatCompletionMessageParam[] = [];

  for (let i = 0; i < prompts.length; i++) {
    const msg = prompts[i];

    if (msg.role === "tool") {
      const toolCallId = (msg as any).tool_call_id as string | undefined;
      const prev = out.length > 0 ? out[out.length - 1] : null;
      const prevToolCalls =
        prev &&
        prev.role === "assistant" &&
        Array.isArray((prev as any).tool_calls)
          ? ((prev as any).tool_calls as Array<{ id: string }>)
          : null;
      const hasMatch =
        !!toolCallId &&
        !!prevToolCalls &&
        prevToolCalls.some((tc) => tc.id === toolCallId);
      if (!hasMatch) {
        // Orphan tool_result — drop it to keep the request valid.
        continue;
      }
      out.push(msg);
      continue;
    }

    if (msg.role === "assistant" && Array.isArray((msg as any).tool_calls)) {
      // Collect the tool_call_ids that actually have results immediately
      // following this assistant message.
      const toolCalls = (msg as any).tool_calls as Array<{ id: string }>;
      const followingIds = new Set<string>();
      for (let j = i + 1; j < prompts.length; j++) {
        const next = prompts[j];
        if (next.role !== "tool") break;
        const id = (next as any).tool_call_id as string | undefined;
        if (id) followingIds.add(id);
      }
      const filteredCalls = toolCalls.filter((tc) => followingIds.has(tc.id));
      if (filteredCalls.length === 0) {
        // All tool_calls are orphans; strip the tool_calls field. Keep the
        // message if it has text content, otherwise drop it entirely.
        const content = (msg as any).content;
        if (typeof content === "string" && content.length > 0) {
          const { tool_calls: _ignored, ...rest } = msg as any;
          out.push(rest as ChatCompletionMessageParam);
        }
        continue;
      }
      if (filteredCalls.length !== toolCalls.length) {
        const cloned: any = { ...msg, tool_calls: filteredCalls };
        out.push(cloned as ChatCompletionMessageParam);
        continue;
      }
      out.push(msg);
      continue;
    }

    out.push(msg);
  }

  return out;
}

/**
 * Drop assistant messages from the tail of the prompt list before sending to
 * the LLM. A conversation ending with an assistant message is treated as
 * prefill by Anthropic-backed providers, and newer models reject it with
 * "This model does not support assistant message prefill". Clients append
 * assistant-role notes (e.g. artifact operation summaries) after tool results,
 * so the history can legitimately end with assistant messages — they belong in
 * the visible history but must not terminate the LLM request.
 *
 * Returns a new array; the original (used for signature generation) is left
 * untouched so signatures keep matching the client's stored history.
 */
function trimTrailingAssistantMessages(
  prompts: ChatCompletionMessageParam[],
): ChatCompletionMessageParam[] {
  let end = prompts.length;
  while (
    end > 0 &&
    prompts[end - 1].role === "assistant" &&
    !Array.isArray((prompts[end - 1] as any).tool_calls)
  ) {
    end--;
  }
  return prompts.slice(0, end);
}

/**
 * Tool call event data for artifact operations
 */
export interface ToolCallData {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

/**
 * Tool activity status event data, so clients can show what the AI is doing.
 * - generating: the model is producing the tool call (arguments still streaming)
 * - running: a backend tool is executing server-side
 * - done: a backend tool finished executing
 */
export interface ToolStatusData {
  id: string;
  name: string;
  status: "generating" | "running" | "done";
  isError?: boolean;
}

/**
 * Signed snapshot of the custom instructions active for this request.
 * The server signs content + timestamp so clients can keep a verifiable
 * history of when their custom instructions changed.
 */
export interface InstructionsSnapshotData {
  content: string;
  timestamp: number;
  signature: string;
}

/**
 * Events emitted during streaming. Consumers can map these to SSE frames or other transports.
 */
export type StreamEvent =
  | { type: "memory_request"; data: { keys: string[] } }
  | { type: "memory_write"; data: { key: string; value: string } }
  | { type: "memory_delete"; data: { key: string } }
  | { type: "chunk"; data: { delta: string } }
  | { type: "tool_call"; data: ToolCallData }
  | { type: "tool_status"; data: ToolStatusData }
  | { type: "signature"; data: { signature: string } }
  | { type: "instructions"; data: InstructionsSnapshotData }
  | { type: "sentiment"; data: SentimentSummary }
  | { type: "error"; data: { message: string; code?: string } }
  | { type: "done"; data?: null };

/**
 * Encapsulates the streaming chat logic so controllers remain thin.
 * Currently simulates token streaming by chunking a full response, but can be
 * upgraded to real provider streaming without changing controller code.
 */
export class StreamingChatService {
  private chatService: ChatService;
  private memoryService: MemoryService;
  private billingApi: BillingApi;
  private conversationApi: ConversationApi;

  constructor(assistantName: string) {
    this.chatService = new ChatService(assistantName);
    this.memoryService = new MemoryService(assistantName);
    this.billingApi = new BillingApi();
    this.conversationApi = new ConversationApi(assistantName);
  }

  /**
   * Streams chat result as an async generator of StreamEvent objects.
   * Flow:
   *  - balance check (authenticated users with long chats)
   *  - memory request check
   *  - generate streamed response (native provider streaming)
   *  - if LLM returns backend tool calls, execute them and loop
   *  - forward frontend-only tool calls to client
   *  - emit chunk events from provider deltas
   *  - emit signature and done
   */
  async *streamChat(
    body: ChatRequest,
    user: User | null,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent, void, void> {
    if (Array.isArray(body.prompts)) {
      body.prompts = sanitizeToolMessages(body.prompts);
    }

    // When custom instructions are in play, emit a signed snapshot of them so
    // the client can keep a verifiable, timestamped history of instruction
    // changes alongside the chat (used when sharing conversations/artifacts).
    if (body.customSystemPrompt) {
      const timestamp = Date.now();
      yield {
        type: "instructions",
        data: {
          content: body.customSystemPrompt,
          timestamp,
          signature: this.chatService.generateInstructionsSignature(
            body.customSystemPrompt,
            timestamp,
          ),
        },
      };
    }

    // Agentic commands (e.g. /goal) run the model as an autonomous, multi-step
    // research agent. They get a much larger tool-loop budget and the full set
    // of tools a normal chat has — including the library, which we force on so
    // the agent can always reach for it.
    const isAgentic = !!resolvePromptListItem(body.prompts)?.agentic;
    if (isAgentic) {
      body.libraryIntegrationEnabled = true;
    }

    const totalMessages = Array.isArray(body.prompts) ? body.prompts.length : 0;
    const paywallMessage =
      "Insufficient balance. Please donate through KoFi with this email address to continue using the service.";

    // Logged-out users get the default model and no premium features
    if (!user) {
      body.model = getDefaultModel();
      body.artifactIndex = undefined;
      body.pdfCacheId = undefined;
      body.pdfKey = undefined;
      body.tools = undefined;
    }

    // Guard: a PDF may only be sent to a document-capable model. Never
    // silently drop the attachment — warn the user instead.
    if (hasPdfArtifact(body) && !(await modelSupportsDocuments(body.model))) {
      yield {
        type: "error",
        data: {
          message:
            "The selected model does not support PDF documents. Please choose a document-capable model (marked 📄) to send a PDF.",
        },
      };
      yield { type: "done" };
      return;
    }

    // Skip paywall when using the default model — it's free for everyone.
    const isDefaultModel = body.model === getDefaultModel();

    if (totalMessages >= 10 && !isDefaultModel) {
      if (!user) {
        yield {
          type: "error",
          data: { message: paywallMessage, code: INSUFFICIENT_BALANCE_CODE },
        };
        yield { type: "done" };
        return;
      }

      const userBalance = await this.billingApi.GetBalance(user.email);
      if (userBalance.lessThanOrEqualTo(0)) {
        body.model = getDefaultModel();
        body.artifactIndex = undefined;
        body.tools = undefined;
      }

      const balance = await this.billingApi.GetTotalBalance(user.email);
      if (balance.lessThanOrEqualTo(0)) {
        yield {
          type: "error",
          data: { message: paywallMessage, code: INSUFFICIENT_BALANCE_CODE },
        };
        yield { type: "done" };
        return;
      }
    }

    // Sentiment analysis of the user's recent messages: billed to the user,
    // so only for logged-in users with a positive personal balance. Skipped
    // for incognito sessions (no trace).
    const sentimentService = new SentimentService();
    if (!body.incognito && user && (await sentimentService.isEligible(user))) {
      const sentiment = await sentimentService.analyzeConversation(
        body.prompts,
        user,
      );
      if (sentiment) {
        body.sentimentContext = sentimentService.buildContextBlock(sentiment);
        yield { type: "sentiment", data: sentiment };
      }
    }

    // Memory request flow (requires user; skipped entirely for incognito)
    if (
      !body.incognito &&
      !!body.memoryIndex &&
      body.memoryIndex.length > 0 &&
      user != null &&
      !body.memoryLoopLimitReached &&
      (body.memoryLoopCount ?? 0) < MAX_MEMORY_FETCH_LOOPS
    ) {
      const requestForMemory = await this.memoryService.requestMemories(
        body,
        user,
      );
      if (requestForMemory.keys.length > 0) {
        yield { type: "memory_request", data: requestForMemory };
        yield { type: "done" };
        return;
      }
    }

    // Stream response from provider, with backend tool execution loop
    const registry = ToolRegistry.getInstance();
    const hasTools =
      (body.tools && body.tools.length > 0) ||
      registry.getDefinitionsForRequest(body).length > 0;

    if (hasTools) {
      const maxIterations = isAgentic
        ? MAX_AGENTIC_LOOP_ITERATIONS
        : MAX_TOOL_LOOP_ITERATIONS;
      yield* this.streamWithToolLoop(body, user, signal, maxIterations);
    } else {
      yield* this.streamSimple(body, user, signal);
    }
  }

  /**
   * Simple streaming without any tool handling.
   */
  private async *streamSimple(
    body: ChatRequest,
    user: User | null,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent, void, void> {
    let full = "";
    const requestBody: ChatRequest = {
      ...body,
      prompts: trimTrailingAssistantMessages(body.prompts),
    };
    for await (const delta of this.conversationApi.streamResponse(
      requestBody,
      user,
      signal,
    )) {
      if (delta && delta.length > 0) {
        full += delta;
        yield { type: "chunk", data: { delta } };
      }
    }

    const signature = this.chatService.generateSignature([
      ...body.prompts,
      { content: full, role: "assistant" },
    ]);
    yield { type: "signature", data: { signature } };
    yield { type: "done" };
  }

  /**
   * Streaming with backend tool execution loop.
   *
   * When the LLM returns tool calls:
   * - Backend-registered tools are executed server-side, results fed back to the LLM
   * - Frontend-only tools are yielded as tool_call events to the client
   *
   * The loop continues until the LLM produces a text response with no backend
   * tool calls, or MAX_TOOL_LOOP_ITERATIONS is reached.
   */
  private async *streamWithToolLoop(
    body: ChatRequest,
    user: User | null,
    signal?: AbortSignal,
    maxIterations: number = MAX_TOOL_LOOP_ITERATIONS,
  ): AsyncGenerator<StreamEvent, void, void> {
    const registry = ToolRegistry.getInstance();

    // Merge backend tool definitions with frontend-provided tools
    const mergedTools = this.mergeTools(body.tools ?? [], registry, body);

    // Per-request MCP tool integration (authenticated users only). Load the
    // user's enabled MCP servers, fetch their OpenAI-style tool defs from the
    // MCP client manager, and merge them in. MCP tool names are namespaced
    // (mcp__<server>__<tool>__<hash>) so they cannot collide with backend or
    // frontend tools. Any error here is treated as zero MCP tools — chat must
    // never break because an MCP server is unreachable. Everything here is a
    // local const scoped to this request (no global state).
    const mcpToolNames = new Set<string>();
    // Reverse map: short tool name → fully-qualified namespaced name.
    // Built from descriptors so that agent/human short-name calls (e.g.
    // "board_create_task") resolve to "mcp__code__board_create_task__1eg9e89".
    const mcpShortToFull = new Map<string, string>();
    let mcpServers: McpServer[] = [];
    if (user) {
      try {
        mcpServers = await getDbContext().mcpServer.findMany({
          where: { userId: user.id, enabled: true },
        });
        if (mcpServers.length > 0) {
          const [mcpTools, mcpDescriptors] = await Promise.all([
            getMcpClientManager().getToolsForUser(user, mcpServers),
            getMcpClientManager().listToolsForUser(user, mcpServers),
          ]);
          for (const t of mcpTools) {
            if (t.type === "function") mcpToolNames.add(t.function.name);
          }
          for (const d of mcpDescriptors) {
            if (mcpShortToFull.has(d.toolName)) {
              console.warn(
                `[tool-loop] MCP short-name collision: "${d.toolName}" ` +
                  `already maps to "${mcpShortToFull.get(d.toolName)}", ` +
                  `ignoring "${d.namespacedName}"`,
              );
              continue;
            }
            mcpShortToFull.set(d.toolName, d.namespacedName);
          }
          mergedTools.push(...mcpTools);
        }
      } catch (err) {
        console.warn(
          "[tool-loop] MCP tool loading failed; proceeding with zero MCP tools",
          err,
        );
        serverLog('error', 'MCP tool loading failed', {
          error: (err as Error)?.message ?? String(err),
        });
        mcpToolNames.clear();
      }
    }

    // Work with a mutable copy of prompts that we extend with tool results.
    // Trailing assistant messages are trimmed so the request never ends with
    // an assistant message (rejected as prefill by Anthropic models).
    const prompts: ChatCompletionMessageParam[] = trimTrailingAssistantMessages(
      body.prompts,
    );
    let full = "";

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      // Create a request copy with current prompts and merged tools
      const iterationBody: ChatRequest = {
        ...body,
        prompts,
        tools: mergedTools,
      };

      // Collect streaming output for this iteration
      const iterationResult = yield* this.streamOneIteration(
        iterationBody,
        user,
        signal,
      );

      full += iterationResult.text;

      // Content-free diagnostics: which tools were offered and what the
      // model called, so tool-loop stalls are visible in the logs.
      console.log(
        "[tool-loop]",
        JSON.stringify({
          iteration,
          model: body.model,
          tools_offered: mergedTools
            .filter((t) => t.type === "function")
            .map((t) => t.function.name),
          mcp_tools_offered:
            mcpToolNames.size > 0 ? Array.from(mcpToolNames) : undefined,
          tool_calls: iterationResult.toolCalls.map((tc) => tc.name),
          text_length: iterationResult.text.length,
        }),
      );

      // If no tool calls at all, we're done
      if (iterationResult.toolCalls.length === 0) {
        // An iteration that produced neither text nor tool calls means the
        // provider cut the response (e.g. a safety/content filter). Tell the
        // user instead of ending the stream in silence.
        if (iterationResult.text.length === 0) {
          const notice =
            "\n\n*The model stopped its reply unexpectedly (likely a " +
            "provider safety filter). Please try again or rephrase.*";
          full += notice;
          yield { type: "chunk", data: { delta: notice } };
        }
        break;
      }

      // Resolve short MCP tool names (e.g. "board_create_task") to their
      // fully-qualified namespaced name before classification. This lets
      // agents and humans use simple tool names without the mcp__ prefix.
      for (const tc of iterationResult.toolCalls) {
        const resolved = mcpShortToFull.get(tc.name);
        if (resolved && mcpToolNames.has(resolved)) {
          tc.name = resolved;
        }
      }

      // Separate backend, frontend, MCP, and unknown tool calls. A frontend
      // tool is one the client actually declared in body.tools. An MCP tool is
      // one we offered this request whose namespaced name (mcp__...) is in the
      // per-request MCP dispatch set. Anything else that isn't backend-
      // registered is a hallucinated tool name, which we must answer
      // server-side with an error tool_result (forwarding it to the client
      // would leave a dangling tool_use nobody responds to).
      const frontendToolNames = new Set(
        (body.tools ?? [])
          .filter((t) => t.type === "function")
          .map((t) => t.function.name),
      );
      const isMcpCall = (tc: { name: string }) =>
        tc.name.startsWith("mcp__") && mcpToolNames.has(tc.name);
      const backendCalls = iterationResult.toolCalls.filter((tc) =>
        registry.has(tc.name),
      );
      const mcpCalls = iterationResult.toolCalls.filter((tc) => isMcpCall(tc));
      const frontendCalls = iterationResult.toolCalls.filter(
        (tc) =>
          !registry.has(tc.name) &&
          !isMcpCall(tc) &&
          frontendToolNames.has(tc.name),
      );
      const unknownCalls = iterationResult.toolCalls.filter(
        (tc) =>
          !registry.has(tc.name) &&
          !isMcpCall(tc) &&
          !frontendToolNames.has(tc.name),
      );

      // Yield frontend tool calls to the client
      for (const tc of frontendCalls) {
        yield { type: "tool_call", data: tc };
      }

      // If nothing to handle server-side, stop looping (remaining are
      // frontend-only and the client will continue the conversation)
      const serverHandledCalls = [
        ...backendCalls,
        ...mcpCalls,
        ...unknownCalls,
      ];
      if (serverHandledCalls.length === 0) {
        break;
      }

      // Build assistant message with tool_calls for the conversation history
      const assistantToolCalls = serverHandledCalls.map((tc) => ({
        id: tc.id,
        type: "function" as const,
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));

      prompts.push({
        role: "assistant",
        content: iterationResult.text || null,
        tool_calls: assistantToolCalls,
      });

      // Execute backend tools and add results to conversation
      for (const tc of backendCalls) {
        const tool = registry.get(tc.name);
        if (!tool) continue;

        yield {
          type: "tool_status",
          data: { id: tc.id, name: tc.name, status: "running" },
        };

        let result: string;
        let isError = false;
        try {
          result = await tool.handler({
            arguments: tc.arguments,
            request: body,
          });
        } catch (err: any) {
          result = `Error executing tool ${tc.name}: ${err?.message ?? String(err)}`;
          isError = true;
          console.error(`Backend tool execution error (${tc.name}):`, err);
          serverLog('error', `Backend tool failed: ${tc.name}`, {
            error: err?.message ?? String(err),
            tool: tc.name,
          });
        }

        yield {
          type: "tool_status",
          data: { id: tc.id, name: tc.name, status: "done", isError },
        };

        // Image tool results carry togoder-image:// tokens (AES key + IV).
        // Those must never enter the LLM context: they burn tokens, leak
        // encryption metadata, and get ref-stripped into invalid JSON on the
        // next turn (which is why the model used to report `url: null`).
        //
        // Instead the server owns rendering: emit the markdown straight into
        // the assistant's visible output, and give the model only a short
        // ref-free confirmation. This also removes the dependence on the model
        // choosing to echo a token back verbatim.
        if (!isError) {
          const refs = extractImageRefs(result);
          if (refs.length > 0) {
            const markdown = (full.length > 0 ? "\n\n" : "") +
              buildImageMarkdown(refs);
            full += markdown;
            yield { type: "chunk", data: { delta: markdown } };
            result = summarizeImageToolResult(refs.length);
          }
        }

        // Drain pending client-side memory operations (write/delete)
        for (const op of drainMemoryOps(body)) {
          if (op.type === "write") {
            yield {
              type: "memory_write",
              data: { key: op.key, value: op.value! },
            };
          } else if (op.type === "delete") {
            yield {
              type: "memory_delete",
              data: { key: op.key },
            };
          }
        }

        prompts.push({
          role: "tool",
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Execute MCP tools asynchronously. Instead of blocking the chat while
      // the remote tool runs (potentially minutes), we dispatch the call in the
      // background and return a job handle immediately. The LLM can poll for
      // the result via the mcp_job_status backend tool, or tell the user to
      // wait and check back.
      if (mcpCalls.length > 0) {
        const mgr = getMcpClientManager();
        for (const tc of mcpCalls) {
          yield {
            type: "tool_status",
            data: { id: tc.id, name: tc.name, status: "running" },
          };

          let result: string;
          let isError = false;
          try {
            const job = mgr.callToolAsync(
              user!,
              mcpServers,
              tc.name,
              tc.arguments,
            );
            result =
              `[MCP job started: ${job.jobId}]\n` +
              `Tool "${tc.name}" is running in the background on server "${job.serverName}".\n` +
              `Poll for the result by calling mcp_job_status with jobId="${job.jobId}".\n` +
              `Tell the user the job is running and they can continue the conversation — ` +
              `you'll check the result when they ask or on the next message.`;
          } catch (err: any) {
            result = `Error dispatching MCP tool ${tc.name}: ${err?.message ?? String(err)}`;
            isError = true;
            console.error(`MCP tool dispatch error (${tc.name}):`, err);
            serverLog('error', `MCP tool dispatch failed: ${tc.name}`, {
              error: err?.message ?? String(err),
              tool: tc.name,
            });
          }

          yield {
            type: "tool_status",
            data: { id: tc.id, name: tc.name, status: "done", isError },
          };

          prompts.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
        }
      }

      // Answer hallucinated tool calls with an error result so the model can
      // recover and respond in text instead of the stream dying silently.
      if (unknownCalls.length > 0) {
        const availableNames = mergedTools
          .filter((t) => t.type === "function")
          .map((t) => t.function.name)
          .join(", ");
        for (const tc of unknownCalls) {
          console.warn(`LLM called unknown tool "${tc.name}"`);
          yield {
            type: "tool_status",
            data: { id: tc.id, name: tc.name, status: "done", isError: true },
          };
          prompts.push({
            role: "tool",
            tool_call_id: tc.id,
            content:
              `Error: tool "${tc.name}" does not exist. ` +
              (availableNames
                ? `Available tools: ${availableNames}. `
                : "No tools are available. ") +
              "Answer the user directly instead.",
          });
        }
      }

      // Loop continues - LLM will process the tool results
    }

    // Emit signature and done
    const signature = this.chatService.generateSignature([
      ...body.prompts,
      { content: full, role: "assistant" },
    ]);
    yield { type: "signature", data: { signature } };
    yield { type: "done" };
  }

  /**
   * Stream one LLM iteration, yielding text chunks to the client and
   * collecting tool calls. Returns accumulated text and tool calls.
   */
  private async *streamOneIteration(
    body: ChatRequest,
    user: User | null,
    signal?: AbortSignal,
  ): AsyncGenerator<
    StreamEvent,
    { text: string; toolCalls: ToolCallData[] },
    void
  > {
    let text = "";
    const toolCalls: ToolCallData[] = [];

    for await (const chunk of this.conversationApi.streamResponseWithTools(
      body,
      user,
      signal,
    )) {
      if (chunk.type === "text") {
        if (chunk.content && chunk.content.length > 0) {
          text += chunk.content;
          yield { type: "chunk", data: { delta: chunk.content } };
        }
      } else if (chunk.type === "tool_call_start") {
        // Let the client show activity while the arguments stream in
        yield {
          type: "tool_status",
          data: { id: chunk.id, name: chunk.name, status: "generating" },
        };
      } else if (chunk.type === "tool_call") {
        let args: Record<string, any> = {};
        try {
          args = chunk.arguments ? JSON.parse(chunk.arguments) : {};
        } catch (e) {
          console.error("Failed to parse tool call arguments:", e);
          args = { raw: chunk.arguments };
        }
        toolCalls.push({
          id: chunk.id,
          name: chunk.name,
          arguments: args,
        });
      }
    }

    return { text, toolCalls };
  }

  /**
   * Merge frontend-provided tools with backend registry definitions.
   * Backend tools take precedence if there's a name conflict.
   */
  private mergeTools(
    frontendTools: ChatCompletionTool[],
    registry: ToolRegistry,
    request: ChatRequest,
  ): ChatCompletionTool[] {
    const backendDefs = registry.getDefinitionsForRequest(request);
    const backendNames = new Set(
      backendDefs.map((d) => (d.type === "function" ? d.function.name : "")),
    );

    // Filter out frontend tools that conflict with backend tool names
    const filteredFrontend = frontendTools.filter(
      (t) => t.type !== "function" || !backendNames.has(t.function.name),
    );

    return [...backendDefs, ...filteredFrontend];
  }
}
