import { useMemo } from 'react';
import { IMessage } from 'react-native-gifted-chat';
import { ApiChatMessage } from '../model/ChatRequest';

/**
 * Extended IMessage interface with artifact support
 */
export interface ExtendedIMessage extends IMessage {
  artifactId?: string;
}

/**
 * Converts an API chat message to Gifted Chat format
 */
const convertToGiftedMessage = (
  msg: ApiChatMessage,
  index: number
): ExtendedIMessage => ({
  _id: index.toString(),
  text: msg.content,
  createdAt: msg.timestamp ? new Date(msg.timestamp) : new Date(),
  user: {
    _id: msg.role === "user" ? 1 : 2,
    name: msg.role === "user" ? "User" : "Assistant",
  },
  artifactId: msg.artifactId,
});

/**
 * Hook for converting API messages to Gifted Chat messages format.
 * Handles the conversion and reversal needed for the inverted chat display.
 */
export const useGiftedMessages = (apiMessages: ApiChatMessage[] | null): ExtendedIMessage[] => {
  const giftedMessages = useMemo(() => {
    if (apiMessages == null) {
      return [];
    }
    // Keep the message's index in apiMessages as its _id so long-press
    // actions can map back to the right message even when hidden
    // messages (tool results, artifact notes) are filtered out.
    return apiMessages
      .map((msg, index) => ({ msg, index }))
      .filter(({ msg }) => !msg.hidden)
      .map(({ msg, index }) => convertToGiftedMessage(msg, index))
      .reverse();
  }, [apiMessages]);

  return giftedMessages;
};
