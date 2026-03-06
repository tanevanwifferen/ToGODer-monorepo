import { createSelector } from "@reduxjs/toolkit";
import { ChatsState, Chat } from "./chatsSlice";
import { ApiChatMessage } from "../../model/ChatRequest";

/**
 * Helper to filter out deleted chats
 */
const filterActiveChats = (chats: Record<string, Chat>): Chat[] =>
  Object.values(chats).filter((chat) => !chat.deleted);

/**
 * Helper to filter out deleted messages
 */
const filterActiveMessages = (messages: ApiChatMessage[]): ApiChatMessage[] =>
  messages.filter((msg) => !msg.deleted);

export const selectChatList = createSelector(
  (state: { chats: ChatsState }) => state.chats.chats,
  (chats) => filterActiveChats(chats)
);

export const selectChats = createSelector(
  (state: { chats: ChatsState }) => state.chats.chats,
  (chats) => filterActiveChats(chats).filter((chat) => !chat.isRequest)
);

export const selectChatRequests = createSelector(
  (state: { chats: ChatsState }) => state.chats.chats,
  (chats) => filterActiveChats(chats).filter((chat) => chat.isRequest)
);

export const selectChatById = createSelector(
  (state: { chats: ChatsState }) => state.chats.chats,
  (_: any, chatId: string) => chatId,
  (chats, chatId) => {
    const chat = chats[chatId];
    // Return null if chat is deleted
    if (!chat || chat.deleted) return null;
    return chat;
  }
);

export const selectCurrentChatId = (state: { chats: ChatsState }) =>
  state.chats.currentChatId;

export const selectCurrentChat = createSelector(
  (state: { chats: ChatsState }) => state.chats.chats,
  selectCurrentChatId,
  (chats, currentChatId) => {
    if (!currentChatId) return null;
    const chat = chats[currentChatId];
    // Return null if chat is deleted
    if (!chat || chat.deleted) return null;
    return chat;
  }
);

export const selectCurrentMessages = createSelector(
  (state: { chats: ChatsState }) => state.chats.chats,
  selectCurrentChatId,
  (chats, currentChatId) => {
    if (!currentChatId) return [];
    const chat = chats[currentChatId];
    if (!chat || chat.deleted) return [];
    // Filter out deleted messages
    return filterActiveMessages(chat.messages);
  }
);

export const selectCurrentMemories = createSelector(
  (state: { chats: ChatsState }) => state.chats.chats,
  selectCurrentChatId,
  (chats, currentChatId) =>
    currentChatId ? chats[currentChatId]?.memories || [] : []
);

export const selectAutoGenerateAnswer = createSelector(
  (state: { chats: ChatsState }) => state.chats,
  (chats) => chats.auto_generate_answer
);

export const selectDraftInputText = createSelector(
  (state: { chats: ChatsState }) => state.chats.chats,
  (_: any, chatId: string) => chatId,
  (chats, chatId) =>
    chatId && chats[chatId] ? chats[chatId].draftInputText || "" : ""
);

/**
 * Select all chats including deleted ones (for sync purposes)
 */
export const selectAllChatsIncludingDeleted = createSelector(
  (state: { chats: ChatsState }) => state.chats.chats,
  (chats) => Object.values(chats)
);
