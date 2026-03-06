import {
  ChatApiClient,
  StreamEvent,
  ArtifactIndexItem,
  ToolSchema,
} from "../apiClients/ChatApiClient";
import {
  ApiChatMessage,
  ChatRequestCommunicationStyle,
} from "../model/ChatRequest";

import type { ArtifactToolCall } from "../apiClients/ChatApiClient";

/**
 * Event handler types for stream events
 */
export type ChunkHandler = (data: string) => void;
export type SignatureHandler = (signature: string) => void;
export type MemoryRequestHandler = (keys: string[]) => void;
export type ToolCallHandler = (toolCall: ArtifactToolCall) => void;
export type ErrorHandler = (error: any) => void;
export type DoneHandler = () => void;

/**
 * Stream configuration options
 */
export interface StreamOptions {
  model: string;
  humanPrompt?: boolean;
  keepGoing?: boolean;
  outsideBox?: boolean;
  holisticTherapist?: boolean;
  communicationStyle: ChatRequestCommunicationStyle;
  messages: ApiChatMessage[];
  configurableData?: string;
  staticData?: Record<string, any>;
  assistant_name?: string;
  memoryIndex?: string[];
  memories?: Record<string, string>;
  customSystemPrompt?: string;
  persona?: string;
  libraryIntegrationEnabled?: boolean;
  memoryLoopCount?: number;
  memoryLoopLimitReached?: boolean;
  artifactIndex?: ArtifactIndexItem[];
  tools?: ToolSchema[];
}

/**
 * ChatStreamService - Centralized service for managing chat streaming.
 *
 * This service provides:
 * - Stream lifecycle management (start, cancel, cleanup)
 * - Event handler registration for stream events
 * - Automatic resource cleanup on stream completion or cancellation
 * - Error recovery and handling
 * - AbortController integration for cancellation
 *
 * Usage:
 * ```typescript
 * const service = ChatStreamService.getInstance();
 *
 * // Register event handlers
 * service.onChunk((data) => console.log('Chunk:', data));
 * service.onError((error) => console.error('Error:', error));
 * service.onDone(() => console.log('Stream complete'));
 *
 * // Start streaming
 * await service.startStream(options);
 *
 * // Cancel if needed
 * service.cancel();
 * ```
 */
export class ChatStreamService {
  private static instance: ChatStreamService;

  // Event handlers
  private chunkHandlers: ChunkHandler[] = [];
  private signatureHandlers: SignatureHandler[] = [];
  private memoryRequestHandlers: MemoryRequestHandler[] = [];
  private toolCallHandlers: ToolCallHandler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private doneHandlers: DoneHandler[] = [];

  // Stream state
  private abortController: AbortController | null = null;
  private streaming = false;

  private constructor() {}

  /**
   * Get the singleton instance of ChatStreamService
   */
  public static getInstance(): ChatStreamService {
    if (!ChatStreamService.instance) {
      ChatStreamService.instance = new ChatStreamService();
    }
    return ChatStreamService.instance;
  }

  /**
   * Register a chunk event handler
   * @param handler Callback to invoke when a chunk is received
   * @returns Cleanup function to unregister the handler
   */
  public onChunk(handler: ChunkHandler): () => void {
    this.chunkHandlers.push(handler);
    return () => {
      const index = this.chunkHandlers.indexOf(handler);
      if (index > -1) {
        this.chunkHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register a signature event handler
   * @param handler Callback to invoke when a signature is received
   * @returns Cleanup function to unregister the handler
   */
  public onSignature(handler: SignatureHandler): () => void {
    this.signatureHandlers.push(handler);
    return () => {
      const index = this.signatureHandlers.indexOf(handler);
      if (index > -1) {
        this.signatureHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register a memory request event handler
   * @param handler Callback to invoke when memory keys are requested
   * @returns Cleanup function to unregister the handler
   */
  public onMemoryRequest(handler: MemoryRequestHandler): () => void {
    this.memoryRequestHandlers.push(handler);
    return () => {
      const index = this.memoryRequestHandlers.indexOf(handler);
      if (index > -1) {
        this.memoryRequestHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register a tool call event handler
   * @param handler Callback to invoke when a tool call is received
   * @returns Cleanup function to unregister the handler
   */
  public onToolCall(handler: ToolCallHandler): () => void {
    this.toolCallHandlers.push(handler);
    return () => {
      const index = this.toolCallHandlers.indexOf(handler);
      if (index > -1) {
        this.toolCallHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register an error event handler
   * @param handler Callback to invoke when an error occurs
   * @returns Cleanup function to unregister the handler
   */
  public onError(handler: ErrorHandler): () => void {
    this.errorHandlers.push(handler);
    return () => {
      const index = this.errorHandlers.indexOf(handler);
      if (index > -1) {
        this.errorHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Register a done event handler
   * @param handler Callback to invoke when the stream completes
   * @returns Cleanup function to unregister the handler
   */
  public onDone(handler: DoneHandler): () => void {
    this.doneHandlers.push(handler);
    return () => {
      const index = this.doneHandlers.indexOf(handler);
      if (index > -1) {
        this.doneHandlers.splice(index, 1);
      }
    };
  }

  /**
   * Check if a stream is currently active
   */
  public isStreaming(): boolean {
    return this.streaming;
  }

  /**
   * Cancel the current stream if one is active
   */
  public cancel(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.cleanup();
    }
  }

  /**
   * Start a new stream with the given options.
   * If a stream is already active, it will be cancelled first.
   *
   * @param options Stream configuration options
   * @throws Error if streaming fails to start
   */
  public async startStream(options: StreamOptions): Promise<void> {
    // Cancel any existing stream
    if (this.streaming) {
      this.cancel();
    }

    // Create new AbortController for this stream
    this.abortController = new AbortController();
    this.streaming = true;

    try {
      // Start the streaming generator
      const generator = ChatApiClient.sendMessageStream(
        options.model,
        options.humanPrompt ?? true,
        options.keepGoing ?? true,
        options.outsideBox ?? true,
        options.holisticTherapist ?? true,
        options.communicationStyle,
        options.messages,
        options.configurableData,
        options.staticData,
        options.assistant_name,
        options.memoryIndex,
        options.memories,
        options.customSystemPrompt,
        options.persona,
        options.libraryIntegrationEnabled ?? false,
        options.memoryLoopCount,
        options.memoryLoopLimitReached,
        options.artifactIndex,
        options.tools,
        this.abortController.signal
      );

      // Consume the stream and dispatch events
      for await (const event of generator) {
        this.handleEvent(event);

        // Stop if done or error
        if (event.type === "done" || event.type === "error") {
          break;
        }
      }
    } catch (error) {
      // Handle streaming errors
      console.error("ChatStreamService: Stream error", error);
      this.dispatchError(error);
      throw error;
    } finally {
      this.cleanup();
    }
  }

  /**
   * Handle a stream event by dispatching to registered handlers
   */
  private handleEvent(event: StreamEvent): void {
    switch (event.type) {
      case "chunk":
        this.dispatchChunk(event.data);
        break;
      case "signature":
        this.dispatchSignature(event.data);
        break;
      case "memory_request":
        this.dispatchMemoryRequest(event.data.keys);
        break;
      case "tool_call":
        this.dispatchToolCall(event.data);
        break;
      case "error":
        this.dispatchError(event.data);
        break;
      case "done":
        this.dispatchDone();
        break;
    }
  }

  /**
   * Dispatch chunk event to all registered handlers
   */
  private dispatchChunk(data: string): void {
    for (const handler of this.chunkHandlers) {
      try {
        handler(data);
      } catch (error) {
        console.error("ChatStreamService: Chunk handler error", error);
      }
    }
  }

  /**
   * Dispatch signature event to all registered handlers
   */
  private dispatchSignature(signature: string): void {
    for (const handler of this.signatureHandlers) {
      try {
        handler(signature);
      } catch (error) {
        console.error("ChatStreamService: Signature handler error", error);
      }
    }
  }

  /**
   * Dispatch memory request event to all registered handlers
   */
  private dispatchMemoryRequest(keys: string[]): void {
    for (const handler of this.memoryRequestHandlers) {
      try {
        handler(keys);
      } catch (error) {
        console.error("ChatStreamService: Memory request handler error", error);
      }
    }
  }

  /**
   * Dispatch tool call event to all registered handlers
   */
  private dispatchToolCall(toolCall: ArtifactToolCall): void {
    for (const handler of this.toolCallHandlers) {
      try {
        handler(toolCall);
      } catch (error) {
        console.error("ChatStreamService: Tool call handler error", error);
      }
    }
  }

  /**
   * Dispatch error event to all registered handlers
   */
  private dispatchError(error: any): void {
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (handlerError) {
        console.error("ChatStreamService: Error handler error", handlerError);
      }
    }
  }

  /**
   * Dispatch done event to all registered handlers
   */
  private dispatchDone(): void {
    for (const handler of this.doneHandlers) {
      try {
        handler();
      } catch (error) {
        console.error("ChatStreamService: Done handler error", error);
      }
    }
  }

  /**
   * Clean up stream resources
   */
  private cleanup(): void {
    this.streaming = false;
    this.abortController = null;
  }

  /**
   * Clear all registered event handlers.
   * Useful for cleanup when unmounting components or resetting state.
   */
  public clearHandlers(): void {
    this.chunkHandlers = [];
    this.signatureHandlers = [];
    this.memoryRequestHandlers = [];
    this.toolCallHandlers = [];
    this.errorHandlers = [];
    this.doneHandlers = [];
  }

  /**
   * Reset the service to its initial state.
   * Cancels any active stream and clears all handlers.
   */
  public reset(): void {
    this.cancel();
    this.clearHandlers();
  }
}
