import { renderHook, act, waitFor } from "@testing-library/react-native";
import {
  useMessageSending,
  MessageSendingApi,
  MessageSendingCallbacks,
  SendMessageOptions,
} from "../useMessageSending";
import { ApiChatMessage } from "../../model/ChatRequest";
import { ChatResponse, MessageResponse } from "../../model/ChatResponse";
import type { StreamEvent } from "../../apiClients/ChatApiClient";

// Helper to create async generator from array of events
async function* createMockStream(
  events: StreamEvent[]
): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    yield event;
  }
}

// Helper to create delayed async generator
async function* createDelayedStream(
  events: StreamEvent[],
  delayMs: number = 10
): AsyncGenerator<StreamEvent> {
  for (const event of events) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    yield event;
  }
}

describe("useMessageSending", () => {
  const mockMessages: ApiChatMessage[] = [{ role: "user", content: "Hello" }];
  const mockMemories: Record<string, string> = { key1: "value1" };

  describe("sendMessage flow (non-streaming)", () => {
    it("should send a message and return response", async () => {
      const mockResponse: MessageResponse = {
        content: "Hello! How can I help?",
        signature: "sig123",
      };

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockResolvedValue(mockResponse),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      let response: MessageResponse | null = null;
      await act(async () => {
        response = await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(response).toEqual(mockResponse);
      expect(mockApi.sendMessage).toHaveBeenCalledWith(
        mockMessages,
        mockMemories,
        undefined
      );
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it("should set isLoading to true while sending", async () => {
      let resolvePromise: (value: MessageResponse) => void;
      const pendingPromise = new Promise<MessageResponse>((resolve) => {
        resolvePromise = resolve;
      });

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockReturnValue(pendingPromise),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      let sendPromise: Promise<MessageResponse | null>;
      act(() => {
        sendPromise = result.current.sendMessage(mockMessages, mockMemories);
      });

      // Should be loading
      expect(result.current.isLoading).toBe(true);

      // Resolve the promise
      await act(async () => {
        resolvePromise!({ content: "Response", signature: "sig" });
        await sendPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("should pass options to sendMessage", async () => {
      const mockResponse: MessageResponse = { content: "Response" };
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockResolvedValue(mockResponse),
      };
      const options: SendMessageOptions = {
        memoryLoopCount: 2,
        memoryLoopLimitReached: true,
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories, options);
      });

      expect(mockApi.sendMessage).toHaveBeenCalledWith(
        mockMessages,
        mockMemories,
        options
      );
    });

    it("should call onComplete callback on success", async () => {
      const mockResponse: MessageResponse = {
        content: "Hello!",
        signature: "sig",
      };
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockResolvedValue(mockResponse),
      };
      const onComplete = jest.fn();
      const callbacks: MessageSendingCallbacks = { onComplete };

      const { result } = renderHook(() =>
        useMessageSending(mockApi, callbacks)
      );

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(onComplete).toHaveBeenCalledWith(mockResponse);
    });

    it("should call onChunk callback with content", async () => {
      const mockResponse: MessageResponse = { content: "Hello!" };
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockResolvedValue(mockResponse),
      };
      const onChunk = jest.fn();
      const callbacks: MessageSendingCallbacks = { onChunk };

      const { result } = renderHook(() =>
        useMessageSending(mockApi, callbacks)
      );

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(onChunk).toHaveBeenCalledWith("Hello!");
    });
  });

  describe("streaming handling", () => {
    it("should handle streaming response with chunks", async () => {
      const events: StreamEvent[] = [
        { type: "chunk", data: "Hello" },
        { type: "chunk", data: " world" },
        { type: "chunk", data: "!" },
        { type: "signature", data: "stream-sig" },
        { type: "done", data: null },
      ];

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn(),
        sendMessageStream: jest
          .fn()
          .mockImplementation(() => createMockStream(events)),
      };
      const onChunk = jest.fn();
      const callbacks: MessageSendingCallbacks = { onChunk };

      const { result } = renderHook(() =>
        useMessageSending(mockApi, callbacks)
      );

      let response: MessageResponse | null = null;
      await act(async () => {
        response = await result.current.sendMessage(mockMessages, mockMemories);
      });

      // Should have accumulated all chunks
      expect(response).toEqual({
        content: "Hello world!",
        signature: "stream-sig",
      });

      // onChunk should be called with accumulated content
      expect(onChunk).toHaveBeenCalledWith("Hello");
      expect(onChunk).toHaveBeenCalledWith("Hello world");
      expect(onChunk).toHaveBeenCalledWith("Hello world!");
    });

    it("should call onSignature callback during streaming", async () => {
      const events: StreamEvent[] = [
        { type: "chunk", data: "Content" },
        { type: "signature", data: "my-signature" },
        { type: "done", data: null },
      ];

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn(),
        sendMessageStream: jest
          .fn()
          .mockImplementation(() => createMockStream(events)),
      };
      const onSignature = jest.fn();
      const callbacks: MessageSendingCallbacks = { onSignature };

      const { result } = renderHook(() =>
        useMessageSending(mockApi, callbacks)
      );

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(onSignature).toHaveBeenCalledWith("my-signature");
    });

    it("should handle memory_request during streaming", async () => {
      const events: StreamEvent[] = [
        { type: "memory_request", data: { keys: ["mem1", "mem2"] } },
      ];

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn(),
        sendMessageStream: jest
          .fn()
          .mockImplementation(() => createMockStream(events)),
      };
      const onMemoryRequest = jest.fn();
      const callbacks: MessageSendingCallbacks = { onMemoryRequest };

      const { result } = renderHook(() =>
        useMessageSending(mockApi, callbacks)
      );

      let response: MessageResponse | null = null;
      await act(async () => {
        response = await result.current.sendMessage(mockMessages, mockMemories);
      });

      // Should return null to signal memory request
      expect(response).toBeNull();
      expect(onMemoryRequest).toHaveBeenCalledWith(["mem1", "mem2"]);
      expect(result.current.error).toBeNull();
    });

    it("should fallback to non-streaming when stream throws", async () => {
      const mockResponse: MessageResponse = {
        content: "Fallback response",
        signature: "fallback-sig",
      };

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockResolvedValue(mockResponse),
        sendMessageStream: jest.fn().mockImplementation(async function* () {
          throw new Error("Streaming not supported");
        }),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      let response: MessageResponse | null = null;
      await act(async () => {
        response = await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(response).toEqual(mockResponse);
      expect(mockApi.sendMessage).toHaveBeenCalled();
    });

    it("should NOT fallback if streaming started successfully", async () => {
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockResolvedValue({ content: "Fallback" }),
        sendMessageStream: jest.fn().mockImplementation(async function* () {
          yield { type: "chunk", data: "Started" } as StreamEvent;
          throw new Error("Stream interrupted");
        }),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      let response: MessageResponse | null = null;
      await act(async () => {
        response = await result.current.sendMessage(mockMessages, mockMemories);
      });

      // Should not fallback - streaming had started
      expect(response).toBeNull();
      expect(result.current.error?.message).toBe("Stream interrupted");
      expect(mockApi.sendMessage).not.toHaveBeenCalled();
    });
  });

  describe("error states", () => {
    it("should set error state on sendMessage failure", async () => {
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockRejectedValue(new Error("Network error")),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      let response: MessageResponse | null = null;
      await act(async () => {
        response = await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(response).toBeNull();
      expect(result.current.error?.message).toBe("Network error");
      expect(result.current.isLoading).toBe(false);
    });

    it("should call onError callback on failure", async () => {
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockRejectedValue(new Error("API error")),
      };
      const onError = jest.fn();
      const callbacks: MessageSendingCallbacks = { onError };

      const { result } = renderHook(() =>
        useMessageSending(mockApi, callbacks)
      );

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
      expect(onError.mock.calls[0][0].message).toBe("API error");
    });

    it("should handle streaming error event", async () => {
      const events: StreamEvent[] = [
        { type: "error", data: "Server overloaded" },
      ];

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn(),
        sendMessageStream: jest
          .fn()
          .mockImplementation(() => createMockStream(events)),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(result.current.error?.message).toBe("Server overloaded");
    });

    it("should handle streaming error event with object data", async () => {
      const events: StreamEvent[] = [
        { type: "error", data: { message: "Rate limited" } },
      ];

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn(),
        sendMessageStream: jest
          .fn()
          .mockImplementation(() => createMockStream(events)),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(result.current.error?.message).toBe("Rate limited");
    });

    it("should clear error with clearError", async () => {
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockRejectedValue(new Error("Error")),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(result.current.error).not.toBeNull();

      act(() => {
        result.current.clearError();
      });

      expect(result.current.error).toBeNull();
    });

    it("should handle non-Error thrown values", async () => {
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockRejectedValue("String error"),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(result.current.error?.message).toBe("Failed to send message");
    });
  });

  describe("retry logic", () => {
    it("should retry the last request", async () => {
      let callCount = 0;
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockImplementation(() => {
          callCount++;
          if (callCount === 1) {
            return Promise.reject(new Error("First attempt failed"));
          }
          return Promise.resolve({ content: "Retry success" });
        }),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      // First attempt fails
      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(result.current.error?.message).toBe("First attempt failed");

      // Retry succeeds
      let retryResponse: MessageResponse | null = null;
      await act(async () => {
        retryResponse = await result.current.retry();
      });

      expect((retryResponse as MessageResponse | null)?.content).toBe(
        "Retry success"
      );
      expect(result.current.error).toBeNull();
      expect(mockApi.sendMessage).toHaveBeenCalledTimes(2);
    });

    it("should preserve options on retry", async () => {
      const mockApi: MessageSendingApi = {
        sendMessage: jest
          .fn()
          .mockResolvedValueOnce({ content: "First" })
          .mockResolvedValueOnce({ content: "Retry" }),
      };
      const options: SendMessageOptions = { memoryLoopCount: 3 };

      const { result } = renderHook(() => useMessageSending(mockApi));

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories, options);
      });

      await act(async () => {
        await result.current.retry();
      });

      expect(mockApi.sendMessage).toHaveBeenNthCalledWith(
        2,
        mockMessages,
        mockMemories,
        options
      );
    });

    it("should return error if no previous request to retry", async () => {
      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn(),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      let response: MessageResponse | null = null;
      await act(async () => {
        response = await result.current.retry();
      });

      expect(response).toBeNull();
      expect(result.current.error?.message).toBe(
        "No previous request to retry"
      );
    });

    it("should clear previous error before retry", async () => {
      const mockApi: MessageSendingApi = {
        sendMessage: jest
          .fn()
          .mockRejectedValueOnce(new Error("Failed"))
          .mockResolvedValueOnce({ content: "Success" }),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(result.current.error).not.toBeNull();

      await act(async () => {
        await result.current.retry();
      });

      expect(result.current.error).toBeNull();
    });
  });

  describe("cancellation", () => {
    it("should cancel ongoing request", async () => {
      const events: StreamEvent[] = [
        { type: "chunk", data: "Starting..." },
        // More events would follow but we'll cancel
      ];

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn(),
        sendMessageStream: jest
          .fn()
          .mockImplementation((_m, _mem, _o, signal) =>
            createDelayedStream(
              [
                { type: "chunk", data: "Start" },
                { type: "chunk", data: "Continue" },
                { type: "done", data: null },
              ],
              50
            )
          ),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      // Start sending
      let sendPromise: Promise<MessageResponse | null>;
      act(() => {
        sendPromise = result.current.sendMessage(mockMessages, mockMemories);
      });

      // Cancel immediately
      act(() => {
        result.current.cancel();
      });

      await act(async () => {
        await sendPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it("should set isLoading to false after cancel", async () => {
      let resolvePromise: (value: ChatResponse) => void;
      const pendingPromise = new Promise<ChatResponse>((resolve) => {
        resolvePromise = resolve;
      });

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockReturnValue(pendingPromise),
      };

      const { result } = renderHook(() => useMessageSending(mockApi));

      act(() => {
        result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(result.current.isLoading).toBe(true);

      act(() => {
        result.current.cancel();
      });

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("memory request handling", () => {
    it("should handle non-streaming memory request", async () => {
      const memoryRequestResponse = {
        requestForMemory: ["key1", "key2"],
      };

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockResolvedValue(memoryRequestResponse),
      };
      const onMemoryRequest = jest.fn();
      const callbacks: MessageSendingCallbacks = { onMemoryRequest };

      const { result } = renderHook(() =>
        useMessageSending(mockApi, callbacks)
      );

      let response: MessageResponse | null = null;
      await act(async () => {
        response = await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(response).toBeNull();
      expect(onMemoryRequest).toHaveBeenCalled();
      expect(result.current.error).toBeNull();
    });

    it("should handle memory request with keys object format", async () => {
      const memoryRequestResponse = {
        requestForMemory: { keys: ["mem1", "mem2"] },
      };

      const mockApi: MessageSendingApi = {
        sendMessage: jest.fn().mockResolvedValue(memoryRequestResponse),
      };
      const onMemoryRequest = jest.fn();
      const callbacks: MessageSendingCallbacks = { onMemoryRequest };

      const { result } = renderHook(() =>
        useMessageSending(mockApi, callbacks)
      );

      await act(async () => {
        await result.current.sendMessage(mockMessages, mockMemories);
      });

      expect(onMemoryRequest).toHaveBeenCalledWith(["mem1", "mem2"]);
    });
  });
});
