/**
 * Example usage of MessageService
 * This file demonstrates how to use the MessageService in different scenarios
 */

import { MessageService } from "./MessageService";
import { ApiChatMessage } from "../model/ChatRequest";

// Get the singleton instance
const messageService = MessageService.getInstance();

// Example 1: Create a new chat
export function exampleCreateChat() {
  const chatId = `chat-${Date.now()}`;
  messageService.createChat(chatId, "My New Chat");
  console.log("Created chat:", chatId);
}

// Example 2: Send a message with streaming
export async function exampleSendMessageWithStreaming() {
  const chatId = "existing-chat-id";

  await messageService.sendMessage({
    chatId,
    content: "Hello, how can you help me today?",
    useStreaming: true,
    onChunk: (content) => {
      // Called for each chunk of the streaming response
      console.log("Received chunk:", content);
    },
    onComplete: (message) => {
      // Called when the full message is received
      console.log("Message complete:", message.content);
    },
    onError: (error) => {
      // Called if an error occurs
      console.error("Error sending message:", error);
    },
  });
}

// Example 3: Send a message without streaming (fallback mode)
export async function exampleSendMessageWithoutStreaming() {
  const chatId = "existing-chat-id";

  await messageService.sendMessage({
    chatId,
    content: "What's the weather like today?",
    useStreaming: false,
    onComplete: (message) => {
      console.log("Message received:", message.content);
    },
    onError: (error) => {
      console.error("Error:", error);
    },
  });
}

// Example 4: Get all messages from a chat
export function exampleGetChatMessages() {
  const chatId = "existing-chat-id";
  const messages = messageService.getChatMessages(chatId);

  console.log(`Chat has ${messages.length} messages`);
  messages.forEach((msg, index) => {
    console.log(`Message ${index + 1} (${msg.role}): ${msg.content}`);
  });
}

// Example 5: Check if a chat exists
export function exampleCheckChatExists() {
  const chatId = "some-chat-id";

  if (messageService.chatExists(chatId)) {
    console.log("Chat exists");
  } else {
    console.log("Chat does not exist");
  }
}

// Example 6: Show a notification
export function exampleShowNotification() {
  messageService.showMessageNotification(
    "New Message",
    "You have received a new message from the assistant",
    "info"
  );
}

// Example 7: Complete workflow - create chat and send message
export async function exampleCompleteWorkflow() {
  // Create a new chat
  const chatId = `chat-${Date.now()}`;
  messageService.createChat(chatId, "Weather Conversation");

  // Check if chat was created
  if (!messageService.chatExists(chatId)) {
    console.error("Failed to create chat");
    return;
  }

  // Send a message with streaming
  await messageService.sendMessage({
    chatId,
    content: "Tell me about the weather forecast",
    useStreaming: true,
    onChunk: (content) => {
      // Update UI with streaming content
      console.log("Streaming:", content);
    },
    onComplete: (message) => {
      // Show notification when complete
      messageService.showMessageNotification(
        "Response Received",
        "The assistant has responded to your message",
        "success"
      );

      // Get all messages in the chat
      const allMessages = messageService.getChatMessages(chatId);
      console.log(`Chat now has ${allMessages.length} messages`);
    },
    onError: (error) => {
      // Show error notification
      messageService.showMessageNotification(
        "Error",
        error,
        "error"
      );
    },
  });
}

// Example 8: Cancel an active request
export function exampleCancelRequest() {
  // Cancel any currently active request
  const wasCancelled = messageService.cancelCurrentRequest();

  if (wasCancelled) {
    console.log("Request was cancelled");
  } else {
    console.log("No active request to cancel");
  }
}

// Example 9: Check if there's an active request
export function exampleCheckActiveRequest() {
  if (messageService.hasActiveRequest()) {
    console.log("There is an active request that can be cancelled");
  } else {
    console.log("No active request");
  }
}

// Example 10: Send a message with a cancel button
export async function exampleSendMessageWithCancelButton() {
  const chatId = "existing-chat-id";

  // Start the request (don't await yet)
  const requestPromise = messageService.sendMessage({
    chatId,
    content: "Write a long story about dragons",
    useStreaming: true,
    onChunk: (content) => {
      console.log("Streaming:", content.length, "chars");

      // Example: Cancel if content gets too long
      if (content.length > 1000) {
        console.log("Response getting too long, cancelling...");
        messageService.cancelCurrentRequest();
      }
    },
    onComplete: (message) => {
      console.log("Message complete:", message.content.length, "chars");
    },
    onError: (error) => {
      console.error("Error:", error);
    },
  });

  // Simulate user pressing cancel button after 2 seconds
  setTimeout(() => {
    if (messageService.hasActiveRequest()) {
      console.log("User pressed cancel button");
      messageService.cancelCurrentRequest();
    }
  }, 2000);

  // Wait for the request to complete (or be cancelled)
  await requestPromise;
}

// Example 11: Using MessageService outside of React components
// This is useful for background tasks, notifications, or other non-UI code
export class BackgroundMessageHandler {
  private messageService = MessageService.getInstance();

  async handleIncomingNotification(chatId: string, userMessage: string) {
    // Check if chat exists, create if not
    if (!this.messageService.chatExists(chatId)) {
      this.messageService.createChat(chatId, "Notification Chat");
    }

    // Send message without streaming (simpler for background tasks)
    await this.messageService.sendMessage({
      chatId,
      content: userMessage,
      useStreaming: false,
      onComplete: (message) => {
        // Could trigger a push notification here
        this.messageService.showMessageNotification(
          "Response Ready",
          message.content.substring(0, 100),
          "info"
        );
      },
      onError: (error) => {
        console.error("Background message failed:", error);
      },
    });
  }

  // Cancel any ongoing request (e.g., when user navigates away)
  cancelOngoingRequest() {
    return this.messageService.cancelCurrentRequest();
  }
}
