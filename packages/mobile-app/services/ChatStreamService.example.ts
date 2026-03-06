/**
 * ChatStreamService Usage Examples
 *
 * This file demonstrates how to use the ChatStreamService for managing
 * chat streaming in the application.
 */

import { ChatStreamService, StreamOptions } from "./ChatStreamService";
import { ChatRequestCommunicationStyle } from "../model/ChatRequest";
import { store } from "../redux";

/**
 * Example 1: Basic streaming with event handlers
 */
export async function basicStreamingExample() {
  const service = ChatStreamService.getInstance();

  // Register event handlers
  const removeChunkHandler = service.onChunk((data) => {
    console.log("Received chunk:", data);
    // Update UI with streaming content
  });

  const removeSignatureHandler = service.onSignature((signature) => {
    console.log("Received signature:", signature);
    // Store message signature
  });

  const removeErrorHandler = service.onError((error) => {
    console.error("Stream error:", error);
    // Handle error in UI
  });

  const removeDoneHandler = service.onDone(() => {
    console.log("Stream completed");
    // Finalize UI state
  });

  // Prepare stream options
  const options: StreamOptions = {
    model: "gpt-4",
    communicationStyle: ChatRequestCommunicationStyle.Default,
    messages: [
      {
        role: "user",
        content: "Hello, how are you?",
      },
    ],
    humanPrompt: true,
    keepGoing: true,
    outsideBox: true,
    holisticTherapist: true,
  };

  try {
    // Start streaming
    await service.startStream(options);
  } catch (error) {
    console.error("Failed to start stream:", error);
  } finally {
    // Cleanup handlers when done
    removeChunkHandler();
    removeSignatureHandler();
    removeErrorHandler();
    removeDoneHandler();
  }
}

/**
 * Example 2: Streaming with memory request handling
 */
export async function streamingWithMemoryExample() {
  const service = ChatStreamService.getInstance();
  let accumulatedContent = "";

  service.onChunk((data) => {
    accumulatedContent += data;
    // Update Redux state with accumulated content
  });

  service.onMemoryRequest((keys) => {
    console.log("Memory keys requested:", keys);
    // Handle memory request - typically would trigger a re-send
    // with the requested memory keys included
  });

  service.onDone(() => {
    console.log("Final content:", accumulatedContent);
  });

  const options: StreamOptions = {
    model: store.getState().userSettings.model,
    communicationStyle:
      store.getState().userSettings.communicationStyle ??
      ChatRequestCommunicationStyle.Default,
    messages: store.getState().chats.chats[store.getState().chats.currentChatId!]
      ?.messages ?? [],
    memoryIndex: [], // Available memory keys
    memories: {}, // Currently loaded memories
  };

  await service.startStream(options);
}

/**
 * Example 3: Cancellable streaming
 */
export async function cancellableStreamingExample() {
  const service = ChatStreamService.getInstance();

  service.onChunk((data) => {
    console.log("Chunk:", data);
  });

  const options: StreamOptions = {
    model: "gpt-4",
    communicationStyle: ChatRequestCommunicationStyle.Default,
    messages: [
      {
        role: "user",
        content: "Tell me a long story...",
      },
    ],
  };

  // Start streaming (non-blocking)
  const streamPromise = service.startStream(options);

  // Simulate user cancellation after 2 seconds
  setTimeout(() => {
    if (service.isStreaming()) {
      console.log("Cancelling stream...");
      service.cancel();
    }
  }, 2000);

  try {
    await streamPromise;
  } catch (error) {
    // Handle cancellation or other errors
    console.log("Stream was cancelled or errored:", error);
  }
}

/**
 * Example 4: React Native component integration
 */
export function useStreamingChat(chatId: string) {
  const service = ChatStreamService.getInstance();

  const startStreaming = async (userMessage: string) => {
    // Get state from Redux
    const state = store.getState();
    const chat = state.chats.chats[chatId];
    const model = state.userSettings.model;
    const communicationStyle =
      state.userSettings.communicationStyle ?? ChatRequestCommunicationStyle.Default;

    // Register handlers
    let assistantContent = "";
    let assistantSignature: string | undefined;

    service.onChunk((data) => {
      assistantContent += data;
      // Dispatch Redux action to update message at index
      // dispatch(updateMessageAtIndex({ chatId, messageIndex, content: assistantContent }));
    });

    service.onSignature((signature) => {
      assistantSignature = signature;
      // Dispatch Redux action to update signature
      // dispatch(updateMessageAtIndex({ chatId, messageIndex, signature }));
    });

    service.onMemoryRequest((keys) => {
      // Handle memory request - add keys to chat memories
      // dispatch(addMemories({ id: chatId, memories: keys }));
    });

    service.onError((error) => {
      console.error("Streaming error:", error);
      // Show error toast or update UI
    });

    service.onDone(() => {
      console.log("Streaming complete");
      // Clean up UI state, update balance, trigger memory update
    });

    // Prepare options
    const options: StreamOptions = {
      model,
      communicationStyle,
      messages: [
        ...chat.messages,
        {
          role: "user",
          content: userMessage,
        },
      ],
      memoryIndex: [], // From StorageService.listKeys()
      memories: {}, // Loaded memories for this chat
      humanPrompt: state.userSettings.humanPrompt,
      keepGoing: state.userSettings.keepGoing,
      outsideBox: state.userSettings.outsideBox,
      holisticTherapist: state.userSettings.holisticTherapist,
    };

    // Start streaming
    await service.startStream(options);
  };

  return {
    startStreaming,
    isStreaming: () => service.isStreaming(),
    cancel: () => service.cancel(),
  };
}

/**
 * Example 5: Cleanup and reset
 */
export function cleanupExample() {
  const service = ChatStreamService.getInstance();

  // Clear all handlers (useful when unmounting components)
  service.clearHandlers();

  // Or reset completely (cancel + clear handlers)
  service.reset();
}
