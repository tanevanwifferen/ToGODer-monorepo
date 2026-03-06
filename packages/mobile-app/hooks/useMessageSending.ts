import { useState, useCallback, useRef } from "react";
import { ApiChatMessage } from "../model/ChatRequest";
import { ChatResponse, MessageResponse } from "../model/ChatResponse";
import type { StreamEvent } from "../apiClients/ChatApiClient";
import { MessageService } from "../services/MessageService";

export interface SendMessageOptions {
  memoryLoopCount?: number;
  memoryLoopLimitReached?: boolean;
}

export interface MessageSendingApi {
  sendMessage: (
    messages: ApiChatMessage[],
    memories: Record<string, string>,
    options?: SendMessageOptions
  ) => Promise<ChatResponse>;
  sendMessageStream?: (
    messages: ApiChatMessage[],
    memories: Record<string, string>,
    options?: SendMessageOptions,
    signal?: AbortSignal
  ) => AsyncGenerator<StreamEvent>;
}

export interface MessageSendingCallbacks {
  onChunk?: (accumulated: string) => void;
  onSignature?: (signature: string) => void;
  onMemoryRequest?: (keys: string[]) => void;
  onComplete?: (response: MessageResponse) => void;
  onError?: (error: Error) => void;
}

export interface UseMessageSendingResult {
  sendMessage: (
    messages: ApiChatMessage[],
    memories: Record<string, string>,
    options?: SendMessageOptions
  ) => Promise<MessageResponse | null>;
  retry: () => Promise<MessageResponse | null>;
  cancel: () => void;
  isLoading: boolean;
  error: Error | null;
  clearError: () => void;
}

/**
 * Core hook for handling message sending with streaming support, error handling, and retry logic.
 * Decoupled from Redux for testability.
 */
function useCoreMessageSending(
  api: MessageSendingApi,
  callbacks?: MessageSendingCallbacks
): UseMessageSendingResult {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Store last request for retry
  const lastRequestRef = useRef<{
    messages: ApiChatMessage[];
    memories: Record<string, string>;
    options?: SendMessageOptions;
  } | null>(null);

  // AbortController for cancellation
  const abortControllerRef = useRef<AbortController | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const cancel = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  const sendMessage = useCallback(
    async (
      messages: ApiChatMessage[],
      memories: Record<string, string>,
      options?: SendMessageOptions
    ): Promise<MessageResponse | null> => {
      // Store for retry
      lastRequestRef.current = { messages, memories, options };

      setIsLoading(true);
      setError(null);

      // Create new abort controller
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      let accumulated = "";
      let signature: string | undefined;
      let usedStreaming = false;
      let receivedStreamError = false;

      try {
        // Try streaming first if available
        if (api.sendMessageStream) {
          try {
            const stream = api.sendMessageStream(messages, memories, options, signal);

            for await (const evt of stream) {
              if (signal.aborted) {
                throw new Error("Request cancelled");
              }

              switch (evt.type) {
                case "chunk": {
                  usedStreaming = true;
                  const chunk = typeof evt.data === "string" ? evt.data : "";
                  accumulated += chunk;
                  callbacks?.onChunk?.(accumulated);
                  break;
                }
                case "signature": {
                  signature = evt.data;
                  callbacks?.onSignature?.(evt.data);
                  break;
                }
                case "memory_request": {
                  const keys = evt.data?.keys ?? [];
                  callbacks?.onMemoryRequest?.(keys);
                  // Return null to signal memory request - caller handles the loop
                  setIsLoading(false);
                  return null;
                }
                case "error": {
                  receivedStreamError = true;
                  const errorMsg =
                    typeof evt.data === "string"
                      ? evt.data
                      : evt.data?.message ?? "Streaming error occurred";
                  throw new Error(errorMsg);
                }
                case "done": {
                  // Stream complete
                  break;
                }
              }
            }
          } catch (streamErr) {
            // If streaming received an error event or we got chunk data, don't fallback
            if (receivedStreamError || (usedStreaming && accumulated.length > 0)) {
              throw streamErr;
            }
            // Otherwise try non-streaming fallback
            usedStreaming = false;
          }
        }

        // Non-streaming fallback
        if (!usedStreaming) {
          const response = await api.sendMessage(messages, memories, options);

          if ("requestForMemory" in response) {
            // Memory request response
            const keys = (response as any).requestForMemory?.keys ??
                        (Array.isArray((response as any).requestForMemory)
                          ? (response as any).requestForMemory
                          : []);
            callbacks?.onMemoryRequest?.(keys);
            setIsLoading(false);
            return null;
          }

          // Content response
          const messageResponse = response as MessageResponse;
          accumulated = messageResponse.content;
          signature = messageResponse.signature;
          callbacks?.onChunk?.(accumulated);
          if (signature) {
            callbacks?.onSignature?.(signature);
          }
        }

        const result: MessageResponse = {
          content: accumulated,
          signature,
        };

        callbacks?.onComplete?.(result);
        setIsLoading(false);
        return result;
      } catch (err) {
        const error = err instanceof Error ? err : new Error("Failed to send message");
        setError(error);
        callbacks?.onError?.(error);
        setIsLoading(false);
        return null;
      } finally {
        abortControllerRef.current = null;
      }
    },
    [api, callbacks]
  );

  const retry = useCallback(async (): Promise<MessageResponse | null> => {
    if (!lastRequestRef.current) {
      const err = new Error("No previous request to retry");
      setError(err);
      return null;
    }

    const { messages, memories, options } = lastRequestRef.current;
    return sendMessage(messages, memories, options);
  }, [sendMessage]);

  return {
    sendMessage,
    retry,
    cancel,
    isLoading,
    error,
    clearError,
  };
}

/**
 * Consumer-friendly result interface for chat-based message sending
 */
export interface UseChatMessageSendingResult {
  sendMessage: (content: string) => Promise<void>;
  retry: () => Promise<void>;
  regenerate: () => Promise<void>;
  cancel: () => void;
  isLoading: boolean;
  typing: boolean;
  error: string | null;
}

/**
 * Consumer-friendly hook for sending messages in a chat.
 * Takes a chatId and provides a simple API for sending messages.
 *
 * This is the hook that should be used in UI components like Chat.tsx.
 * For testing or custom integrations, use the core useMessageSending hook instead.
 *
 * @param chatId - The ID of the chat to send messages to
 * @returns Object with sendMessage, retry, isLoading, typing, and error
 */
export function useMessageSending(chatId: string): UseChatMessageSendingResult;

/**
 * Core hook for message sending with streaming support.
 * Decoupled from Redux for testability.
 *
 * @param api - The API client for sending messages
 * @param callbacks - Optional callbacks for handling events
 * @returns Object with sendMessage, retry, cancel, isLoading, error, and clearError
 */
export function useMessageSending(
  api: MessageSendingApi,
  callbacks?: MessageSendingCallbacks
): UseMessageSendingResult;

/**
 * Implementation of useMessageSending that supports both signatures
 */
export function useMessageSending(
  chatIdOrApi: string | MessageSendingApi,
  callbacks?: MessageSendingCallbacks
): UseChatMessageSendingResult | UseMessageSendingResult {
  // Check if called with chatId (consumer-friendly API)
  if (typeof chatIdOrApi === "string") {
    return useChatMessageSending(chatIdOrApi);
  }

  // Otherwise, use core implementation
  return useCoreMessageSending(chatIdOrApi, callbacks);
}

/**
 * Consumer-friendly hook implementation that wraps MessageService
 */
function useChatMessageSending(chatId: string): UseChatMessageSendingResult {
  const [isLoading, setIsLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastContentRef = useRef<string | null>(null);

  const sendMessage = useCallback(
    async (content: string): Promise<void> => {
      lastContentRef.current = content;
      setIsLoading(true);
      setTyping(true);  // Show typing indicator while waiting for response
      setError(null);

      const messageService = MessageService.getInstance();

      await messageService.sendMessage({
        chatId,
        content,
        useStreaming: true,
        onChunk: () => {
          // Once we receive chunks, content is showing - hide typing indicator
          setTyping(false);
        },
        onComplete: () => {
          setIsLoading(false);
          setTyping(false);
        },
        onError: (errorMsg) => {
          setError(errorMsg);
          setIsLoading(false);
          setTyping(false);
        },
      });
    },
    [chatId]
  );

  const retry = useCallback(async (): Promise<void> => {
    if (lastContentRef.current) {
      await sendMessage(lastContentRef.current);
    }
  }, [sendMessage]);

  const regenerate = useCallback(async (): Promise<void> => {
    setIsLoading(true);
    setTyping(true);  // Show typing indicator while waiting for response
    setError(null);

    const messageService = MessageService.getInstance();

    await messageService.regenerateResponse({
      chatId,
      useStreaming: true,
      onChunk: () => {
        // Once we receive chunks, content is showing - hide typing indicator
        setTyping(false);
      },
      onComplete: () => {
        setIsLoading(false);
        setTyping(false);
      },
      onError: (errorMsg) => {
        setError(errorMsg);
        setIsLoading(false);
        setTyping(false);
      },
    });
  }, [chatId]);

  const cancel = useCallback(() => {
    const messageService = MessageService.getInstance();
    messageService.cancelCurrentRequest();
    setIsLoading(false);
    setTyping(false);
  }, []);

  return {
    sendMessage,
    retry,
    regenerate,
    cancel,
    isLoading,
    typing,
    error,
  };
}
