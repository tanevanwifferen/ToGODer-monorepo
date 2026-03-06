/**
 * Hook for managing and accessing message list functionality.
 * This hook provides utilities for working with messages in a chat,
 * including filtering, searching, and accessing message metadata.
 */
import { useMemo } from "react";
import { useSelector } from "react-redux";
import {
  selectChatById,
  selectCurrentMessages,
} from "../redux/slices/chatSelectors";
import { ApiChatMessage } from "../model/ChatRequest";
import { RootState } from "../redux";

interface UseMessageListOptions {
  chatId?: string;
}

export const useMessageList = (options?: UseMessageListOptions) => {
  const { chatId } = options || {};

  // Get messages from Redux state
  const messages = useSelector((state: RootState) => {
    if (chatId) {
      const chat = selectChatById(state, chatId);
      return chat?.messages || [];
    }
    return selectCurrentMessages(state);
  });

  // Get message count
  const messageCount = useMemo(() => messages.length, [messages.length]);

  // Get last message
  const lastMessage = useMemo(
    () => (messages.length > 0 ? messages[messages.length - 1] : null),
    [messages]
  );

  // Get first message
  const firstMessage = useMemo(
    () => (messages.length > 0 ? messages[0] : null),
    [messages]
  );

  // Filter messages by role
  const filterByRole = useMemo(
    () => (role: "user" | "assistant") =>
      messages.filter((msg) => msg.role === role),
    [messages]
  );

  // Get user messages
  const userMessages = useMemo(
    () => messages.filter((msg) => msg.role === "user"),
    [messages]
  );

  // Get assistant messages
  const assistantMessages = useMemo(
    () => messages.filter((msg) => msg.role === "assistant"),
    [messages]
  );

  // Search messages by content
  const searchMessages = useMemo(
    () => (query: string) => {
      const lowerQuery = query.toLowerCase();
      return messages.filter((msg) =>
        msg.content.toLowerCase().includes(lowerQuery)
      );
    },
    [messages]
  );

  // Get message by index
  const getMessageAtIndex = useMemo(
    () =>
      (index: number): ApiChatMessage | null => {
        if (index >= 0 && index < messages.length) {
          return messages[index];
        }
        return null;
      },
    [messages]
  );

  // Find message index by signature
  const findMessageIndexBySignature = useMemo(
    () =>
      (signature: string): number => {
        return messages.findIndex((msg) => msg.signature === signature);
      },
    [messages]
  );

  // Check if there are any messages
  const hasMessages = messageCount > 0;

  // Check if there are any user messages
  const hasUserMessages = userMessages.length > 0;

  // Check if there are any assistant messages
  const hasAssistantMessages = assistantMessages.length > 0;

  return {
    messages,
    messageCount,
    lastMessage,
    firstMessage,
    userMessages,
    assistantMessages,
    hasMessages,
    hasUserMessages,
    hasAssistantMessages,
    filterByRole,
    searchMessages,
    getMessageAtIndex,
    findMessageIndexBySignature,
  };
};
