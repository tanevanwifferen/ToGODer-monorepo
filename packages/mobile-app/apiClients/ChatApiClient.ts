import { ApiClient } from "./ApiClient";
import {
  ChatRequestCommunicationStyle,
  ApiChatMessage,
} from "../model/ChatRequest";
import {
  ChatResponse,
  TitleResponse,
  ExperienceResponse,
  UpdateMemoryResponse,
  SystemPromptResponse,
} from "../model/ChatResponse";
import { store } from "../redux";
import { getApiUrl } from "../constants/Env";
import { Platform } from "react-native";

export interface ArtifactToolCall {
  id: string;
  name: "read_artifact" | "write_artifact" | "delete_artifact" | "move_artifact" | "list_directory";
  arguments: {
    path: string;
    content?: string;
    name?: string;
    mimeType?: string;
    destination?: string;
    depth?: number;
  };
}

export interface ArtifactIndexItem {
  path: string;
  name: string;
  mimeType?: string;
  type: "file" | "folder";
}

/**
 * Tool schema definition for AI function calling (OpenAI format)
 */
export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, {
        type: string;
        description: string;
      }>;
      required: string[];
    };
  };
}

/**
 * Library query tool schema for AI function calling.
 * Included when library integration is enabled.
 */
export const LIBRARY_TOOL_SCHEMA: ToolSchema = {
  type: "function",
  function: {
    name: "query_library",
    description: "Search the user's personal library for relevant information. Use this to find notes, saved content, or knowledge the user has stored.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The search query to find relevant content in the library"
        }
      },
      required: ["query"]
    }
  }
};

/**
 * Artifact tool schemas for AI function calling.
 * These define the tools the AI can use to manipulate artifacts.
 */
export const ARTIFACT_TOOL_SCHEMAS: ToolSchema[] = [
  {
    type: "function",
    function: {
      name: "read_artifact",
      description: "Read the content of an artifact file or list contents of a folder. Use this to view existing artifacts.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path to the artifact to read (e.g., '/src/main.ts' or '/docs')"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_artifact",
      description: "Create a new artifact or update an existing artifact's content. Use this to save code, documents, or other files.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path where the artifact should be saved (e.g., '/src/utils.ts')"
          },
          content: {
            type: "string",
            description: "The content to write to the artifact"
          },
          name: {
            type: "string",
            description: "Optional display name for the artifact. If not provided, the filename from the path will be used."
          },
          mimeType: {
            type: "string",
            description: "Optional MIME type for the artifact (e.g., 'text/typescript', 'application/json')"
          }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "delete_artifact",
      description: "Delete an existing artifact. Use this to remove files or folders that are no longer needed.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path to the artifact to delete (e.g., '/old-file.txt')"
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "move_artifact",
      description: "Move an artifact to a different folder. Use this to reorganize files and folders.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The path to the artifact to move (e.g., '/src/old-location.ts')"
          },
          destination: {
            type: "string",
            description: "The destination folder path (e.g., '/lib' or '/' for root)"
          }
        },
        required: ["path", "destination"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_directory",
      description: "List the contents of a directory incrementally. Use this for navigating the artifact tree without loading everything at once. Returns immediate children of the specified path.",
      parameters: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "The directory path to list (e.g., '/' for root, '/src' for a subfolder)"
          },
          depth: {
            type: "number",
            description: "How many levels deep to list (default: 1 for immediate children only, use higher values for nested listing)"
          }
        },
        required: ["path"]
      }
    }
  }
];

export interface ToolResultEvent {
  tool_call_id: string;
  name: string;
  result: string;
  is_error: boolean;
}

export type StreamEvent =
  | { type: "chunk"; data: string }
  | { type: "signature"; data: string }
  | { type: "memory_request"; data: { keys: string[] } }
  | { type: "tool_call"; data: ArtifactToolCall }
  | { type: "tool_result"; data: ToolResultEvent }
  | { type: "error"; data: any }
  | { type: "done"; data: null };

export class ChatApiClient {
  /**
   * Updates memory asynchronously for a given set of messages.
   * This endpoint returns the same updateData object as /chat but processes it asynchronously.
   */
  static async updateMemory(
    model: string,
    messages: ApiChatMessage[],
    configurableData?: string,
    staticData?: Record<string, any> | undefined,
    assistant_name?: string | undefined,
    memoryIndex?: string[] | undefined,
    memories?: Record<string, string> | undefined
  ): Promise<UpdateMemoryResponse> {
    const response = await ApiClient.post<UpdateMemoryResponse>(
      "/chat/memory-update",
      {
        model,
        prompts: messages,
        configurableData,
        staticData,
        assistant_name,
        memoryIndex,
        memories,
      }
    );

    if (response instanceof Error) {
      throw response;
    }
    return response as UpdateMemoryResponse;
  }

  static async sendMessage(
    model: string,
    humanPrompt: boolean = true,
    keepGoing: boolean = true,
    outsideBox: boolean = true,
    holisticTherapist: boolean = true,
    communicationStyle: ChatRequestCommunicationStyle,
    messages: ApiChatMessage[],
    configurableData?: string,
    staticData?: Record<string, any> | undefined,
    assistant_name?: string | undefined,
    memoryIndex?: string[] | undefined,
    memories?: Record<string, string> | undefined,
    customSystemPrompt?: string | undefined,
    persona?: string | undefined,
    libraryIntegrationEnabled: boolean = false,
    memoryLoopCount?: number,
    memoryLoopLimitReached?: boolean,
    artifactIndex?: ArtifactIndexItem[] | undefined,
    tools?: ToolSchema[] | undefined
  ): Promise<ChatResponse> {
    const response = await ApiClient.post<ChatResponse>("/chat", {
      model,
      humanPrompt,
      keepGoing,
      outsideBox,
      holisticTherapist,
      communicationStyle,
      prompts: messages,
      configurableData,
      staticData,
      assistant_name,
      memoryIndex,
      memories,
      customSystemPrompt,
      persona,
      libraryIntegrationEnabled,
      memoryLoopCount,
      memoryLoopLimitReached,
      artifactIndex,
      tools,
    });

    if (response instanceof Error) {
      throw response;
    }
    return response as ChatResponse;
  }

  /**
   * Streaming chat over SSE via POST /chat/stream. Yields StreamEvent objects.
   * Gracefully throws on environments without streaming support so callers can fallback.
   */
  static async *sendMessageStream(
    model: string,
    humanPrompt: boolean = true,
    keepGoing: boolean = true,
    outsideBox: boolean = true,
    holisticTherapist: boolean = true,
    communicationStyle: ChatRequestCommunicationStyle,
    messages: ApiChatMessage[],
    configurableData?: string,
    staticData?: Record<string, any> | undefined,
    assistant_name?: string | undefined,
    memoryIndex?: string[] | undefined,
    memories?: Record<string, string> | undefined,
    customSystemPrompt?: string | undefined,
    persona?: string | undefined,
    libraryIntegrationEnabled: boolean = false,
    memoryLoopCount?: number,
    memoryLoopLimitReached?: boolean,
    artifactIndex?: ArtifactIndexItem[] | undefined,
    tools?: ToolSchema[] | undefined,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const baseUrl = getApiUrl();
    if (!baseUrl) {
      // getApiUrl() already provides sensible web fallbacks (origin + '/api')
      // If still empty, fail fast so configuration issues are visible
      throw new Error("Missing API base URL");
    }
    // Auth
    const token = store.getState().auth.token;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const payload = {
      model,
      humanPrompt,
      keepGoing,
      outsideBox,
      holisticTherapist,
      communicationStyle,
      prompts: messages,
      configurableData,
      staticData,
      assistant_name,
      memoryIndex,
      memories,
      customSystemPrompt,
      persona,
      libraryIntegrationEnabled,
      memoryLoopCount,
      memoryLoopLimitReached,
      artifactIndex,
      tools,
    };

    // On React Native mobile, fetch() does not support ReadableStream for
    // response bodies. Previously we would call fetch() first, discover that
    // res.body is null, and then fall back to XHR — but that caused TWO
    // backend requests per message (the first response was silently discarded).
    // Skip fetch entirely on mobile and go straight to XHR.
    const canUseReadableStream =
      typeof ReadableStream !== "undefined" &&
      Platform.OS !== "ios" &&
      Platform.OS !== "android";

    let reader: any = null;

    if (canUseReadableStream) {
      const res = await fetch(`${baseUrl}/chat/stream`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal,
      });

      if (!res.ok) {
        throw new Error(`Stream error: ${res.status} ${res.statusText}`);
      }

      const bodyAny: any = res.body as any;
      reader =
        bodyAny && typeof bodyAny.getReader === "function"
          ? bodyAny.getReader()
          : null;
    }

    if (!reader) {
      // React Native mobile: use XHR for streaming SSE.
      // Fallback to XHR with onprogress to parse SSE frames incrementally.
      const streamUrl = `${baseUrl}/chat/stream`;
      const xhrPayload = JSON.stringify(payload);

      // Inline async generator using XHR
      async function* streamWithXhr(): AsyncGenerator<StreamEvent> {
        const xhr = new (globalThis as any).XMLHttpRequest();
        let buffer = "";
        let resolved = false;

        const cleanup = () => {
          if (!resolved) {
            resolved = true;
          }
        };

        // Abort support
        if (signal) {
          if (signal.aborted) {
            throw new Error("Aborted");
          }
          signal.addEventListener(
            "abort",
            () => {
              try {
                xhr.abort();
              } catch {}
            },
            { once: true }
          );
        }

        const parseBuffer = function* (): Generator<StreamEvent> {
          let idx: number;
          // SSE frames separated by blank line
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const rawEvent = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 2);
            if (!rawEvent) continue;

            let eventType: string | null = null;
            const dataLines: string[] = [];
            for (const line of rawEvent.split(/\r?\n/)) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                dataLines.push(line.slice(5).trim());
              }
            }

            const dataStr = dataLines.join("\n");
            let data: any = null;
            if (dataStr.length > 0) {
              try {
                data = JSON.parse(dataStr);
              } catch {
                data = dataStr;
              }
            }

            switch (eventType) {
              case "chunk": {
                let text = "";
                if (typeof data === "string") {
                  text = data;
                } else if (data && typeof data === "object") {
                  text =
                    (data.content as string) ??
                    (data.delta as string) ??
                    (data.text as string) ??
                    (data?.choices?.[0]?.delta?.content as string) ??
                    "";
                }
                if (!text) {
                  try {
                    text =
                      typeof data === "object"
                        ? JSON.stringify(data)
                        : String(data ?? "");
                  } catch {
                    text = String(data ?? "");
                  }
                }
                yield { type: "chunk", data: text };
                break;
              }
              case "signature": {
                const sig =
                  typeof data === "string" ? data : data?.signature ?? "";
                yield { type: "signature", data: sig };
                break;
              }
              case "memory_request":
                yield {
                  type: "memory_request",
                  data: data as { keys: string[] },
                };
                break;
              case "tool_call":
                yield {
                  type: "tool_call",
                  data: data as ArtifactToolCall,
                };
                break;
              case "tool_result":
                yield {
                  type: "tool_result",
                  data: data as ToolResultEvent,
                };
                break;
              case "error":
                yield { type: "error", data };
                break;
              case "done":
                yield { type: "done", data: null };
                break;
              default:
                // ignore unknown events
                break;
            }
          }
        };

        const eventsQueue: StreamEvent[] = [];
        // Track how much of xhr.responseText we've already consumed to avoid duplication
        let lastIndex = 0;
        let isDone = false;

        xhr.open("POST", streamUrl, true);
        xhr.setRequestHeader("Content-Type", "application/json");
        xhr.setRequestHeader("Accept", "text/event-stream");
        xhr.setRequestHeader("Cache-Control", "no-cache");
        xhr.setRequestHeader("Connection", "keep-alive");
        // Auth header if present
        if (headers["Authorization"]) {
          xhr.setRequestHeader("Authorization", headers["Authorization"]);
        }

        xhr.onreadystatechange = () => {
          // readyState 3 => receiving, 4 => done
          if (xhr.readyState === 3 || xhr.readyState === 4) {
            const resp = xhr.responseText ?? "";
            // Append only the new data since last callback
            const chunk = resp.substring(lastIndex);
            // Update lastIndex to the total received so far
            lastIndex = resp.length;
            if (chunk) {
              buffer += chunk;
              for (const evt of parseBuffer()) {
                eventsQueue.push(evt);
                // Mark done if we receive done event
                if (evt.type === "done") {
                  isDone = true;
                }
              }
            }
          }
        };

        const awaitNextTick = () =>
          new Promise<void>((resolve) => setTimeout(resolve, 0));

        const promise = new Promise<void>((resolve, reject) => {
          xhr.onerror = () => {
            cleanup();
            reject(new Error("XHR streaming error"));
          };
          xhr.onabort = () => {
            cleanup();
            resolve();
          };
          xhr.onload = () => {
            // Final parse on completion
            for (const evt of parseBuffer()) {
              eventsQueue.push(evt);
              if (evt.type === "done") {
                isDone = true;
              }
            }
            // Ensure a final done frame if not already emitted
            if (!isDone) {
              eventsQueue.push({ type: "done", data: null });
            }
            cleanup();
            resolve();
          };
        });

        try {
          xhr.send(xhrPayload);
          // Drain queue as data arrives
          // Loop until onload/onabort/onerror resolves promise
          while (true) {
            // Yield any queued events
            while (eventsQueue.length > 0) {
              const evt = eventsQueue.shift()!;
              yield evt;
              if (evt.type === "done" || evt.type === "error") {
                return;
              }
            }
            // If request finished and queue is empty, exit
            if (xhr.readyState === 4) {
              return;
            }
            await awaitNextTick();
          }
        } finally {
          cleanup();
          try {
            if (xhr.readyState !== 4) {
              xhr.abort();
            }
          } catch {}
        }
      }

      // Delegate to XHR streaming generator and then return
      for await (const evt of streamWithXhr()) {
        yield evt;
        if (evt.type === "done") {
          return;
        }
      }
      return;
    }

    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete SSE events separated by double newlines
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const rawEvent = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 2);
          if (!rawEvent) continue;

          let eventType: string | null = null;
          const dataLines: string[] = [];

          for (const line of rawEvent.split(/\r?\n/)) {
            if (line.startsWith("event:")) {
              eventType = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              dataLines.push(line.slice(5).trim());
            }
          }

          const dataStr = dataLines.join("\n");
          let data: any = null;
          if (dataStr.length > 0) {
            try {
              data = JSON.parse(dataStr);
            } catch {
              data = dataStr;
            }
          }

          switch (eventType) {
            case "chunk": {
              // Coerce provider chunk payloads into plain text
              let text = "";
              if (typeof data === "string") {
                text = data;
              } else if (data && typeof data === "object") {
                text =
                  (data.content as string) ??
                  (data.delta as string) ??
                  (data.text as string) ??
                  (data?.choices?.[0]?.delta?.content as string) ??
                  "";
              }
              if (!text) {
                try {
                  text =
                    typeof data === "object"
                      ? JSON.stringify(data)
                      : String(data ?? "");
                } catch {
                  text = String(data ?? "");
                }
              }
              yield { type: "chunk", data: text };
              break;
            }
            case "signature": {
              const sig =
                typeof data === "string" ? data : data?.signature ?? "";
              yield { type: "signature", data: sig };
              break;
            }
            case "memory_request":
              yield {
                type: "memory_request",
                data: data as { keys: string[] },
              };
              break;
            case "tool_call":
              yield {
                type: "tool_call",
                data: data as ArtifactToolCall,
              };
              break;
            case "tool_result":
              yield {
                type: "tool_result",
                data: data as ToolResultEvent,
              };
              break;
            case "error":
              yield { type: "error", data };
              break;
            case "done":
              yield { type: "done", data: null };
              return;
            default:
              // ignore unknown events
              break;
          }
        }
      }
      // Safety: end
      yield { type: "done", data: null };
    } finally {
      try {
        // reader may not support cancel in some environments
        if (reader && typeof reader.cancel === "function") {
          await reader.cancel();
        }
      } catch {}
    }
  }

  static async getTitle(messages: ApiChatMessage[]): Promise<string> {
    const response = await ApiClient.post<TitleResponse>("/title", {
      content: messages,
    });

    if (response instanceof Error) {
      throw response;
    }
    return (response as TitleResponse).content;
  }

  static async startExperience(
    model: string,
    language: string,
    data?: Record<string, any>
  ): Promise<string> {
    const response = await ApiClient.post<ExperienceResponse>("/experience", {
      model,
      language,
      data,
    });

    if (response instanceof Error) {
      throw response;
    }
    return (response as ExperienceResponse).content;
  }

  /**
   * Generates a personalized system prompt based on user data and memories.
   * This method handles the memory request loop automatically by fetching required memories
   * and re-sending the request until a system prompt is generated.
   */
  static async generateSystemPrompt(
    model: string,
    humanPrompt: boolean = true,
    keepGoing: boolean = true,
    outsideBox: boolean = true,
    holisticTherapist: boolean = true,
    communicationStyle: ChatRequestCommunicationStyle,
    messages: ApiChatMessage[],
    configurableData?: string,
    staticData?: Record<string, any> | undefined,
    assistant_name?: string | undefined,
    memoryIndex?: string[] | undefined,
    memories?: Record<string, string> | undefined,
    memoryLoopCount?: number,
    memoryLoopLimitReached?: boolean
  ): Promise<SystemPromptResponse> {
    const response = await ApiClient.post<SystemPromptResponse>(
      "/generate-system-prompt",
      {
        model,
        humanPrompt,
        keepGoing,
        outsideBox,
        holisticTherapist,
        communicationStyle,
        prompts: messages,
        configurableData,
        staticData,
        assistant_name,
        memoryIndex,
        memories,
        memoryLoopCount,
        memoryLoopLimitReached,
      }
    );

    if (response instanceof Error) {
      throw response;
    }
    return response as SystemPromptResponse;
  }
}
