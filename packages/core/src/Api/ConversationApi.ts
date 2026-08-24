import {
  ChatCompletion,
  ChatCompletionMessageParam,
} from "openai/resources/index";
import {
  AdaptToConversantsCommunicationStyle,
  FormattingPrompt,
  holisticTherapistPrompt,
  HumanResponsePrompt,
  InformalCommunicationStyle,
  keepConversationGoingPrompt,
  lessBloatPrompt,
  outsideBoxPrompt,
  ToolCallDisciplinePrompt,
} from "../LLM/prompts/chatprompts";
import { PromptList, resolvePromptListItem } from "../LLM/prompts/promptlist";
import {
  GetTitlePrompt,
  requestForMemoryPrompt,
  requestForMemoryBasedOnSystemPromptPrompt,
  UpdatePersonalDataPrompt,
} from "../LLM/prompts/systemprompts";
import {
  ChatRequest,
  ChatRequestCommunicationStyle,
} from "../Model/ChatRequest";
import {
  AIProvider,
  getAIWrapper,
  getDefaultModel,
  modelSupportsDocuments,
} from "../LLM/Model/AIProvider";
import { StreamChunk } from "../LLM/AIWrapper";
import { logLlmContentEnabled } from "../LLM/OutputLogger";
import { TranslationPrompt } from "../LLM/prompts/experienceprompts";
import { User } from "@prisma/client";
import { BillingDecorator } from "../Decorators/BillingDecorator";
import { keysSchema } from "../zod/requestformemory";
import { rootpersona } from "../LLM/prompts/rootprompts";
import { loadSeedV2 } from "../LLM/prompts/seedv2";
import { ParsedChatCompletion } from "openai/resources/chat/completions/index";
import {
  isV2Enabled,
  shouldEvaluate,
  runWatcherBackground,
  getWatcherInterval,
} from "../Services/WatcherService";
import {
  extractCovenantStateWithAI,
  renderCovenantState,
  getUserCovenant,
  setUserCovenant,
  CovenantState,
} from "../Services/CovenantService";
import { getPdf, storePdf } from "../Services/PdfCache";
import {
  getEncryptedPdf,
  hasEncryptedPdf,
} from "../Services/PdfDocStore";
import { decryptPdfData } from "../Services/PdfCrypto";
import {
  deriveSessionId,
  mergeSessionModifications,
} from "../Tools/SystemPromptTool";
import { stripTogoderRefs } from "../Services/ImageSanitizer";

let quote = "";

function CompletionToContent(completion: ChatCompletion): string {
  return completion.choices[0].message.content!;
}

function JsonToContent(completion: ParsedChatCompletion<any>): string {
  const response = completion.choices[0].message;
  return completion.choices[0].message.content!;
}

/**
 * Return a copy of the prompts where the last user message carries the
 * hidden sentiment-analysis block. The original request prompts are left
 * untouched (signatures are computed over the originals), so the injection
 * is only ever visible to the model.
 */
function withSentimentContext(
  input: ChatRequest,
): ChatCompletionMessageParam[] {
  if (!input.sentimentContext) return input.prompts;
  const lastUserIndex = input.prompts.map((p) => p.role).lastIndexOf("user");
  if (lastUserIndex === -1) return input.prompts;
  const last = input.prompts[lastUserIndex];
  if (typeof last.content !== "string") return input.prompts;
  const injected = {
    ...last,
    content:
      last.content +
      "\n\n<hidden-context>\n" +
      input.sentimentContext +
      "\n</hidden-context>",
  } as ChatCompletionMessageParam;
  return [
    ...input.prompts.slice(0, lastUserIndex),
    injected,
    ...input.prompts.slice(lastUserIndex + 1),
  ];
}

/**
 * Whether the request carries a PDF that should be sent to the model as a
 * native file content part: either an explicit PDF artifact (with base64
 * content, legacy path) or, preferably, an out-of-band cached upload
 * referenced by `pdfCacheId` (resolved from the in-memory cache, so the
 * message payload never carries the bytes).
 */
export function hasPdfArtifact(input: ChatRequest): boolean {
  if (input.pdfCacheId) {
    if (getPdf(input.pdfCacheId)) return true;
    // Persisted (encrypted) upload kept out-of-band on disk; the key is
    // provided per request and not needed to know a doc exists.
    if (hasEncryptedPdf(input.pdfCacheId)) return true;
  }
  return !!(
    input.artifactIndex &&
    input.artifactIndex.some((a) => a.mimeType === "application/pdf" && a.data)
  );
}

/**
 * Inject PDFs as native OpenRouter/OpenAI `file` content parts into the last
 * user message, so a document-capable model can read the PDF contents
 * directly instead of only seeing a text listing of artifacts.
 *
 * Only called when the selected model supports document input. Out-of-band
 * cached uploads (pdfCacheId) are resolved from the in-memory cache here;
 * they are never embedded in the conversation history. Legacy PDF artifacts
 * (with `data`) are also handled. The returned array is a new copy; the
 * original prompts (used for signature generation) are left untouched.
 */
async function injectPdfFileParts(
  prompts: ChatCompletionMessageParam[],
  input: ChatRequest,
  supportsDocs: boolean,
): Promise<ChatCompletionMessageParam[]> {
  if (!supportsDocs) return prompts;

  const pdfs: { name: string; data: string }[] = [];

  // Preferred: out-of-band cached upload (payload stays small). Try the
  // in-memory hot cache first (decrypted copy for the current turn); if it's
  // cold, fall back to the persisted encrypted doc on disk and decrypt it
  // with the client-provided key, seeding the hot cache so retries within the
  // turn don't re-decrypt.
  if (input.pdfCacheId) {
    let cached = getPdf(input.pdfCacheId);
    if (!cached && input.pdfKey) {
      const enc = await getEncryptedPdf(input.pdfCacheId);
      if (enc) {
        const data = decryptPdfData(input.pdfKey, enc.iv, enc.data);
        if (data) {
          // Seed the hot cache with the decrypted copy under the same id,
          // so subsequent retries/regenerations this turn resolve instantly.
          storePdf(
            { id: input.pdfCacheId, name: enc.name, mimeType: enc.mimeType, data },
          );
          cached = getPdf(input.pdfCacheId);
        }
      }
    }
    if (cached) {
      pdfs.push({ name: input.pdfName || cached.name, data: cached.data });
    }
  }

  // Legacy path: base64 PDF in the artifact index
  for (const a of input.artifactIndex ?? []) {
    if (a.mimeType === "application/pdf" && a.data) {
      pdfs.push({ name: a.name, data: a.data });
    }
  }

  if (pdfs.length === 0) return prompts;

  const lastUserIndex = prompts.map((p) => p.role).lastIndexOf("user");
  if (lastUserIndex === -1) return prompts;
  const last = prompts[lastUserIndex];
  const textContent = typeof last.content === "string" ? last.content : "";

  const parts: any[] = [];
  if (textContent) {
    parts.push({ type: "text", text: textContent });
  }
  for (const pdf of pdfs) {
    parts.push({
      type: "file",
      file: {
        file_data: `data:application/pdf;base64,${pdf.data}`,
        filename: pdf.name,
      },
    });
  }

  const injected = { ...last, content: parts } as ChatCompletionMessageParam;
  return [
    ...prompts.slice(0, lastUserIndex),
    injected,
    ...prompts.slice(lastUserIndex + 1),
  ];
}

/**
 * Build the prompts to send to the model: sentiment-context injection
 * followed by PDF file-content-part injection (when the model is
 * document-capable). Out-of-band cached PDFs are resolved from the cache
 * so the conversation payload stays small.
 */
export async function buildLlmMessages(
  input: ChatRequest,
): Promise<ChatCompletionMessageParam[]> {
  // Strip togoder-image:// reference URLs from all message content before
  // sending to the LLM. These are display-layer artifacts — the model must
  // never see encrypted blob references (wastes context, leaks metadata).
  const strippedPrompts: ChatCompletionMessageParam[] = input.prompts.map((p) => {
    if (typeof p.content === "string") {
      return { ...p, content: stripTogoderRefs(p.content) };
    }
    return p;
  });
  const strippedInput = { ...input, prompts: strippedPrompts };
  const base = withSentimentContext(strippedInput);
  const supportsDocs = await modelSupportsDocuments(input.model);
  return await injectPdfFileParts(base, input, supportsDocs);
}

export class ConversationApi {
  public get assistant_name(): string {
    return this._assistant_name;
  }

  constructor(private _assistant_name: string) {}

  public getQuote() {
    return quote;
  }

  public getAIWrapper(provider: AIProvider, user: User | null | undefined) {
    var aiWrapper = getAIWrapper(provider);
    if (user != null) {
      aiWrapper = new BillingDecorator(aiWrapper, user);
    }
    return aiWrapper;
  }

  /**
   * Get personal data updates based on the conversation
   */
  public async getPersonalDataUpdates(
    prompts: ChatCompletionMessageParam[],
    shortTermMemory: any,
    date: string,
    model: AIProvider,
    user: User | null | undefined,
    signal?: AbortSignal,
  ): Promise<string> {
    var aiWrapper = this.getAIWrapper(AIProvider.LLama3370b, user);
    var inputMessages = prompts.length > 2 ? prompts.slice(-2) : prompts;
    const data_str =
      typeof shortTermMemory == "string"
        ? shortTermMemory
        : JSON.stringify(shortTermMemory);
    const messages = [
      {
        role: "system" as const,
        content: `current date: ${date || new Date().toISOString()}`,
      },
      {
        role: "system" as const,
        content: `Current memory log: ${shortTermMemory || "emtpy"}\n\nUser messages: ${JSON.stringify(inputMessages)}`,
      },
    ];
    const response = await aiWrapper.getResponse(
      UpdatePersonalDataPrompt,
      messages,
      1,
      signal,
    );
    const content = CompletionToContent(response);
    return content;
  }

  /**
   * Get a short title for a conversation based on the first prompt.
   */
  public async getTitle(
    body: ChatCompletionMessageParam[],
    model: AIProvider,
    user: User | null | undefined,
    signal?: AbortSignal,
  ): Promise<string> {
    var aiWrapper = this.getAIWrapper(model, user);

    var prompt = GetTitlePrompt + body[0].content;

    return CompletionToContent(
      await aiWrapper.getResponse(prompt, body, 1, signal),
    );
  }

  public async requestMemories(
    body: ChatRequest,
    user: User,
    signal?: AbortSignal,
  ): Promise<{ keys: string[] }> {
    if (!body.memoryIndex || body.memoryIndex.length == 0) {
      return { keys: [] };
    }
    let memoryPrompt = requestForMemoryPrompt;
    memoryPrompt += this.formatPersonalData(body);
    memoryPrompt +=
      "\n\nThis is the list of all possible memories you can choose from: " +
      JSON.stringify(body.memoryIndex);

    const wrapper = this.getAIWrapper(AIProvider.DeepSeekV4Flash, user);
    const json_response = await wrapper.getJSONResponse(
      memoryPrompt,
      [body.prompts[body.prompts.length - 1]],
      keysSchema,
      1,
      signal,
    );
    const content = JsonToContent(json_response);
    if ((await json_response).usage?.total_tokens == 0) {
      return { keys: [] };
    }

    if (logLlmContentEnabled()) {
      console.log("memory response", json_response);
    }
    var keys = JSON.parse(content) as { keys: string[] };
    var existing_keys = Object.keys(body.memories ?? {});
    keys.keys = (keys.keys ?? []).filter((x) => !existing_keys.includes(x));
    return keys;
  }

  /**
   * Request memories that are relevant to a generated system prompt.
   * This method analyzes the system prompt content to determine which memories would enhance it.
   */
  public async requestMemoriesForSystemPrompt(
    systemPrompt: string,
    memoryIndex: string[],
    existingMemories: { [key: string]: string },
    user: User,
    signal?: AbortSignal,
  ): Promise<{ keys: string[] }> {
    if (!memoryIndex || memoryIndex.length == 0) {
      return { keys: [] };
    }

    let memoryPrompt = requestForMemoryBasedOnSystemPromptPrompt;
    memoryPrompt += "\n\nGenerated system prompt:\n" + systemPrompt;
    memoryPrompt +=
      "\n\nThis is the list of all possible memories you can choose from: " +
      JSON.stringify(memoryIndex);

    const wrapper = this.getAIWrapper(AIProvider.DeepSeekV4Flash, user);
    const json_response = await wrapper.getJSONResponse(
      memoryPrompt,
      [
        {
          role: "system",
          content: `Current date: ${new Date().toISOString()}`,
        },
        {
          role: "user",
          content:
            "Please analyze the system prompt and return relevant memory keys.",
        },
      ],
      keysSchema,
      1,
      signal,
    );
    const content = JsonToContent(json_response);
    if ((await json_response).usage?.total_tokens == 0) {
      return { keys: [] };
    }

    if (logLlmContentEnabled()) {
      console.log("memory response", content);
    }
    var keys = JSON.parse(content) as { keys: string[] };
    var existing_keys = Object.keys(existingMemories ?? {});
    keys.keys = (keys.keys ?? []).filter((x) => !existing_keys.includes(x));
    return keys;
  }

  public async getResponseRaw(
    input: ChatCompletionMessageParam[],
    systemPrompt: string,
    model: AIProvider = getDefaultModel(),
    user: User | null | undefined,
    signal?: AbortSignal,
  ): Promise<ChatCompletion> {
    var aiWrapper = this.getAIWrapper(model, user);
    return await aiWrapper.getResponse(systemPrompt, input, 1, signal);
  }

  /** Whether v2 is active for this request (flag on, no override). */
  private isV2Active(input: ChatRequest): boolean {
    const command = resolvePromptListItem(input.prompts);
    return isV2Enabled() && !input.customSystemPrompt && !command;
  }

  // Build the full system prompt string based on input request options
  private async buildSystemPrompt(
    input: ChatRequest,
    user: User | null | undefined,
  ): Promise<string> {
    // ── v2 Seed Prompt ──────────────────────────────────────────
    // When v2 is enabled and no explicit command overrides it, use the
    // seed‑v2 prompt with covenant state injected.
    const useV2 = this.isV2Active(input);

    let systemPrompt: string;
    if (useV2) {
      systemPrompt = loadSeedV2();

      // ── Per-user Covenant: AI-drawn, not hardcoded ────────────
      // Each user has their own independent Covenant state.
      const userId = user?.id ?? 'anonymous';
      const existingCovenant = getUserCovenant(userId);

      // Use a fast/cheap model for covenant extraction
      const covenantWrapper = this.getAIWrapper(
        AIProvider.DeepSeekV4Flash,
        user,
      );
      const covenant = await extractCovenantStateWithAI(
        input.prompts,
        covenantWrapper,
        existingCovenant ?? undefined,
      );

      // Persist per-user state
      setUserCovenant(userId, covenant);

      const covenantText = renderCovenantState(covenant);
      systemPrompt = systemPrompt.replace(
        /\{\{ covenant_state \}\}/g,
        covenantText,
      );
    } else {
      const command = resolvePromptListItem(input.prompts);
      systemPrompt =
        input.customSystemPrompt ?? PromptList["/default"].prompt;
      if (command) {
        systemPrompt = command.prompt;
      }
    }

    if (input.persona && String(input.persona).length > 0) {
      const personaHeader =
        "User persona (personal background/preferences for better responses): " +
        input.persona;
      systemPrompt = personaHeader + "\n\n" + systemPrompt;
    }

    systemPrompt += "\n\n" + FormattingPrompt;

    // Tool-call discipline: must be high in the prompt so the model
    // prioritises it.  Emitting a tool call inline is required — never
    // end a response with an announcement like "let me search that".
    if (input.tools && input.tools.length > 0) {
      systemPrompt += "\n\n" + ToolCallDisciplinePrompt;
    }

    if (input.humanPrompt) {
      systemPrompt += "\n\n" + HumanResponsePrompt;
    }

    switch (input.communicationStyle) {
      case ChatRequestCommunicationStyle.Default:
        break;
      case ChatRequestCommunicationStyle.LessBloat:
        systemPrompt += "\n\n" + lessBloatPrompt;
        break;
      case ChatRequestCommunicationStyle.AdaptToConversant:
        systemPrompt += "\n\n" + AdaptToConversantsCommunicationStyle;
        break;
      case ChatRequestCommunicationStyle.Informal:
        systemPrompt += "\n\n" + InformalCommunicationStyle;
        break;
    }

    if (input.outsideBox) {
      systemPrompt += "\n\n" + outsideBoxPrompt;
    }

    if (input.keepGoing) {
      systemPrompt += "\n\n" + keepConversationGoingPrompt;
    }

    if (input.holisticTherapist) {
      systemPrompt += "\n\n" + holisticTherapistPrompt;
    }

    systemPrompt = systemPrompt.replace(
      /{{ name }}/g,
      () => this.assistant_name!,
    );

    // Skip personal data for incognito sessions — no trace left behind
    if (!input.incognito) {
      systemPrompt += "\n\n" + this.formatPersonalData(input);
    }
    systemPrompt = rootpersona + "\n\n" + systemPrompt;

    // ── Session-level prompt modifications ─────────────────────
    // Merge any AI-requested system prompt modifications for this
    // conversation session. The update_system_prompt tool allows
    // the AI to add/update/remove named sections (preferences,
    // context, tone) that persist across turns within a session.
    const firstUserMsg = input.prompts.find(
      (p) => p.role === "user",
    )?.content;
    const sessionId = deriveSessionId(
      typeof firstUserMsg === "string" ? firstUserMsg : undefined,
      this.assistant_name,
    );
    systemPrompt = mergeSessionModifications(systemPrompt, sessionId);

    return systemPrompt;
  }

  /**
   * Get a chat completion for a conversation with the AI.
   * @param input Chat history
   * @param user User to bill for the conversation
   * @param signal Optional AbortSignal to cancel the request
   * @returns string response from the AI
   */
  public async getResponse(
    input: ChatRequest,
    user: User | null | undefined,
    signal?: AbortSignal,
  ): Promise<string> {
    if (input.prompts.length == 0) {
      return "";
    }
    const aiWrapper = this.getAIWrapper(input.model, user);
    const systemPrompt = await this.buildSystemPrompt(input, user);

    let output = CompletionToContent(
      await aiWrapper.getResponse(
        systemPrompt,
        await buildLlmMessages(input),
        input.libraryIntegrationEnabled ? 2 : 1,
        signal,
      ),
    );

    // ── Watcher: AI-driven depth evaluation, fire-and-forget ────
    // Moved out of the critical path. The user gets the original response
    // immediately. If the watcher finds the response shallow, it rewrites
    // in the background and stores an instruction in the Covenant for the
    // NEXT request's system prompt.
    if (this.isV2Active(input)) {
      const userId = user?.id ?? 'anonymous';
      const covenant = getUserCovenant(userId);
      const exchangeCount = covenant?.exchangeCount ?? 0;

      if (shouldEvaluate(exchangeCount)) {
        const watcherEvalWrapper = this.getAIWrapper(
          AIProvider.DeepSeekV4Flash,
          user,
        );
        const rewriteWrapper = this.getAIWrapper(input.model, user);
        const llmMessages = await buildLlmMessages(input);
        runWatcherBackground(
          userId,
          this.assistant_name!,
          output,
          systemPrompt,
          llmMessages,
          watcherEvalWrapper,
          rewriteWrapper,
        );
      } else {
        console.log(
          `[watcher] skipped (exchange ${exchangeCount}, next eval at ${Math.ceil(exchangeCount / getWatcherInterval()) * getWatcherInterval()})`,
        );
      }
    }

    return output;
  }

  /**
   * Native streaming response generator using provider streaming.
   * Yields incremental content deltas as they are produced by the model.
   * @param input Chat history and configuration
   * @param user User to bill for the conversation
   * @param signal Optional AbortSignal to cancel the streaming request
   */
  public async *streamResponse(
    input: ChatRequest,
    user: User | null | undefined,
    signal?: AbortSignal,
  ): AsyncGenerator<string, void, void> {
    if (input.prompts.length == 0) {
      return;
    }
    const aiWrapper = this.getAIWrapper(input.model, user);
    const systemPrompt = await this.buildSystemPrompt(input, user);
    for await (const delta of aiWrapper.streamResponse(
      systemPrompt,
      await buildLlmMessages(input),
      input.libraryIntegrationEnabled ? 2 : 1,
      signal,
    )) {
      if (delta) yield delta;
    }
  }

  /**
   * Streaming response with tool support.
   * Yields StreamChunk objects that can be either text deltas or tool calls.
   * @param input Chat history and configuration
   * @param user User to bill for the conversation
   * @param signal Optional AbortSignal to cancel the streaming request
   */
  public async *streamResponseWithTools(
    input: ChatRequest,
    user: User | null | undefined,
    signal?: AbortSignal,
  ): AsyncGenerator<StreamChunk, void, void> {
    if (input.prompts.length == 0) {
      return;
    }
    const aiWrapper = this.getAIWrapper(input.model, user);
    const systemPrompt = await this.buildSystemPrompt(input, user);
    for await (const chunk of aiWrapper.streamResponseWithTools(
      systemPrompt,
      await buildLlmMessages(input),
      input.tools,
      input.libraryIntegrationEnabled ? 2 : 1,
      signal,
    )) {
      yield chunk;
    }
  }

  private formatPersonalData(body: ChatRequest): string {
    // Add data as system message if provided
    let personalData = [];
    if (body.configurableData) {
      personalData.push(
        "This is personal data about the user: " +
          JSON.stringify(body.configurableData),
      );
    }
    if (body.staticData) {
      personalData.push(
        "This is static data about the user: " +
          JSON.stringify(body.staticData),
      );
    }
    if (body.memories && Object.keys(body.memories).length > 0) {
      Object.keys(body.memories).forEach((key) => {
        personalData.push(`memory ${key}: ` + body.memories[key]);
      });
    }

    // Include artifact index so AI knows what files are available to read
    if (body.artifactIndex && body.artifactIndex.length > 0) {
      const artifactList = body.artifactIndex
        .map((a) => `- ${a.name} (${a.mimeType}) at path: ${a.path}`)
        .join("\n");
      personalData.push(
        "Available artifacts (files you can read using the read_file tool):\n" +
          artifactList,
      );
    }

    var date = () =>
      new Date().toDateString() + " " + new Date().toTimeString();
    personalData.push("The date today = " + body.staticData?.date || date());

    return personalData.join("\n\n");
  }

  public async TranslateText(
    text: string,
    language: string = "English",
    model: AIProvider = AIProvider.LLama3370b,
    user: User | null | undefined,
    signal?: AbortSignal,
  ): Promise<string> {
    var aiWrapper = this.getAIWrapper(model, user);
    text = text.replace(/{{ name }}/g, this.assistant_name);
    var result = await aiWrapper.getResponse(
      TranslationPrompt + language,
      [{ role: "user", content: text }],
      1,
      signal,
    );
    return CompletionToContent(result);
  }
}

async function updateQuote() {
  var q = await new ConversationApi("").getResponseRaw(
    [{ content: "the assistant is a spiritual guide", role: "user" }],
    "Share a short fitting message for people who seek. make it quotable.",
    getDefaultModel(),
    null,
  );
  quote = CompletionToContent(q);
}

updateQuote();
setInterval(updateQuote, 1000 * 60 * 60 * 24);
