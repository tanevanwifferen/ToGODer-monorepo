import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ApiChatMessage } from "../../model/ChatRequest";
import { SignedInstructionSnapshot } from "../../model/ShareTypes";
import { v4 as uuidv4 } from "uuid";

export interface Chat {
  id: string;
  title?: string | null;
  messages: ApiChatMessage[];
  isRequest: boolean;
  last_update?: number;
  memories: string[];
  draftInputText?: string;
  projectId?: string;
  deleted?: boolean; // Tombstone marker for sync
  deletedAt?: number; // When the chat was deleted
  // Server-signed history of the custom instructions used in this chat.
  // A new entry is appended only when the instructions actually change.
  instructionHistory?: SignedInstructionSnapshot[];
}

export interface ChatsState {
  chats: {
    [id: string]: Chat;
  };
  currentChatId: string | null;
  // false if a message, got deleted, true when a message just got added
  auto_generate_answer: boolean;
}

const initialState: ChatsState = {
  chats: {},
  currentChatId: null,
  auto_generate_answer: true,
};

// Selectors expose only active (non-deleted) messages, so indices coming
// from the UI are in that space. Translate to an index into the raw
// messages array, which still holds deletion tombstones. Returns -1 when
// the active index is out of range.
const toRawMessageIndex = (
  messages: ApiChatMessage[],
  activeIndex: number
): number => {
  if (activeIndex < 0) return -1;
  let remaining = activeIndex;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].deleted) continue;
    if (remaining === 0) return i;
    remaining--;
  }
  return -1;
};

const chatsSlice = createSlice({
  name: "chats",
  initialState,
  reducers: {
    addChat: (
      state,
      action: PayloadAction<Omit<Chat, "isRequest"> & { isRequest?: boolean }>
    ) => {
      state.chats[action.payload.id] = {
        ...action.payload,
        isRequest: action.payload.isRequest ?? false,
        last_update: new Date().getTime(),
      };
    },
    addMessage: (
      state,
      action: PayloadAction<{ id: string; message: ApiChatMessage }>
    ) => {
      const { id, message } = action.payload;
      const chat = state.chats[id];
      if (!chat) {
        console.warn(`Chat ${id} not found when adding message`);
        return;
      }
      delete message.updateData;
      const now = new Date().getTime();
      chat.messages.push({
        ...message,
        id: message.id || uuidv4(), // Ensure message has ID for sync
        timestamp: message.timestamp || now,
      });
      // Do not sort messages here; keep insertion order so streaming updates
      // using messageIndex remain stable for the just-appended placeholder.
      chat.last_update = now;
      // Only auto-generate when a USER message is appended; assistant/system should not flip this on
      state.auto_generate_answer = message.role === "user";
    },
    // New: update message content/signature at a specific index (for streaming)
    updateMessageAtIndex: (
      state,
      action: PayloadAction<{
        chatId: string;
        messageIndex: number;
        content?: string;
        signature?: string;
        tool_calls?: ApiChatMessage["tool_calls"];
      }>
    ) => {
      const { chatId, messageIndex, content, signature, tool_calls } =
        action.payload;
      const chat = state.chats[chatId];
      if (!chat) {
        console.warn(`Chat ${chatId} not found when updating message`);
        return;
      }
      if (messageIndex < 0 || messageIndex >= chat.messages.length) {
        console.warn(
          `Invalid message index ${messageIndex} for chat ${chatId}`
        );
        return;
      }

      // Important: produce a NEW array reference so useSelector(selectCurrentMessages)
      // sees a changed value and components re-render (RN iOS was not updating).
      const newMessages = chat.messages.map((m, i) =>
        i === messageIndex
          ? {
              ...m,
              content: content !== undefined ? content : m.content,
              signature:
                signature !== undefined ? signature : (m as any).signature,
              tool_calls:
                tool_calls !== undefined ? tool_calls : m.tool_calls,
              timestamp: m.timestamp || new Date().getTime(),
            }
          : m
      );

      chat.messages = newMessages;
      chat.last_update = new Date().getTime();
      // Don't change auto_generate_answer when updating message content
    },
    deleteMessage: (
      state,
      action: PayloadAction<{ chatId: string; messageIndex: number }>
    ) => {
      const { chatId, messageIndex } = action.payload;
      const chat = state.chats[chatId];
      if (!chat) {
        console.warn(`Chat ${chatId} not found when deleting message`);
        return;
      }
      // messageIndex is an index into the active (non-deleted) messages,
      // as shown by selectors; translate to the raw array which still
      // holds tombstones.
      const rawIndex = toRawMessageIndex(chat.messages, messageIndex);
      if (rawIndex !== -1) {
        const now = new Date().getTime();

        // Mark message as deleted (tombstone) for sync instead of removing
        chat.messages = chat.messages.map((m, i) =>
          i === rawIndex ? { ...m, deleted: true, deletedAt: now } : m
        );

        chat.last_update = now;
      }
      state.auto_generate_answer = false;
    },
    deleteMessageByContent: (
      state,
      action: PayloadAction<{ chatId: string; content: string }>
    ) => {
      const { chatId, content } = action.payload;
      const chat = state.chats[chatId];
      const messageIndex = chat.messages.findIndex(
        (message) => message.content === content
      );
      if (chat && messageIndex >= 0) {
        chat.messages.splice(messageIndex, 1);
      }
      chat.last_update = new Date().getTime();
    },
    // Record a server-signed custom-instructions snapshot on a chat. Only
    // appends when the instruction content differs from the latest entry, so
    // the history reflects actual changes (with verifiable timestamps).
    appendInstructionSnapshot: (
      state,
      action: PayloadAction<{
        chatId: string;
        snapshot: SignedInstructionSnapshot;
      }>
    ) => {
      const { chatId, snapshot } = action.payload;
      const chat = state.chats[chatId];
      if (!chat) {
        console.warn(`Chat ${chatId} not found when adding instructions`);
        return;
      }
      const history = chat.instructionHistory ?? [];
      const last = history[history.length - 1];
      if (last && last.content === snapshot.content) {
        return;
      }
      chat.instructionHistory = [...history, snapshot];
      chat.last_update = new Date().getTime();
    },
    setTitle: (state, action: PayloadAction<{ id: string; title: string }>) => {
      const chat = state.chats[action.payload.id];
      if (chat) {
        chat.title = action.payload.title;
      }
    },
    deleteChat: (state, action: PayloadAction<string>) => {
      const chat = state.chats[action.payload];
      if (chat) {
        // Mark as deleted (tombstone) for sync instead of removing
        const now = new Date().getTime();
        chat.deleted = true;
        chat.deletedAt = now;
        chat.last_update = now;
      }
      if (state.currentChatId === action.payload) {
        state.currentChatId = null;
      }
    },
    setCurrentChat: (state, action: PayloadAction<string | null>) => {
      state.currentChatId = action.payload;
    },
    clearAllChats: (state) => {
      state.chats = {};
      state.currentChatId = null;
    },
    addMemories: (
      state,
      action: PayloadAction<{ id: string; memories: string[] }>
    ) => {
      const existing = state.chats[action.payload.id].memories;
      console.log("existing", existing);
      for (const memory of action.payload.memories) {
        if (existing.includes(memory)) {
          continue;
        }
        console.log("adding", memory);
        existing.push(memory);
      }
    },
    updateDraftInputText: (
      state,
      action: PayloadAction<{ chatId: string; text: string }>
    ) => {
      const { chatId, text } = action.payload;
      const chat = state.chats[chatId];
      if (chat) {
        chat.draftInputText = text;
      }
    },
    // Explicitly control whether the UI should auto-trigger a response.
    // This lets us turn it off as soon as a send starts to prevent duplicates.
    setAutoGenerateAnswer: (state, action: PayloadAction<boolean>) => {
      state.auto_generate_answer = action.payload;
    },
    setProjectForChat: (
      state,
      action: PayloadAction<{ chatId: string; projectId: string | undefined }>
    ) => {
      const chat = state.chats[action.payload.chatId];
      if (chat) {
        chat.projectId = action.payload.projectId;
      }
      chat.last_update = new Date().getTime();
    },
    // Edit a message and truncate all messages after it (for conversation branching)
    editMessageAndTruncate: (
      state,
      action: PayloadAction<{
        chatId: string;
        messageIndex: number;
        content: string;
      }>
    ) => {
      const { chatId, messageIndex, content } = action.payload;
      const chat = state.chats[chatId];
      if (!chat) {
        console.warn(`Chat ${chatId} not found when editing message`);
        return;
      }
      // messageIndex is an index into the active (non-deleted) messages,
      // as shown by selectors; translate to the raw array which still
      // holds tombstones.
      const rawIndex = toRawMessageIndex(chat.messages, messageIndex);
      if (rawIndex === -1) {
        console.warn(
          `Invalid message index ${messageIndex} for chat ${chatId}`
        );
        return;
      }

      // Create a new array with messages up to and including the edited message
      const newMessages = chat.messages.slice(0, rawIndex + 1).map((m, i) =>
        i === rawIndex
          ? {
              ...m,
              content,
              timestamp: new Date().getTime(),
            }
          : m
      );

      chat.messages = newMessages;
      chat.last_update = new Date().getTime();
      // Set to true since editing a user message typically means wanting a new response
      state.auto_generate_answer = true;
    },
    // Set chats from sync - replaces all chats with synced data
    setChatsFromSync: (state, action: PayloadAction<Record<string, Chat>>) => {
      state.chats = action.payload;
      // Keep current chat if it still exists, otherwise clear it
      if (state.currentChatId && !action.payload[state.currentChatId]) {
        state.currentChatId = null;
      }
    },
  },
});

export const {
  addChat,
  addMessage,
  updateMessageAtIndex,
  appendInstructionSnapshot,
  deleteMessage,
  deleteMessageByContent,
  setTitle,
  deleteChat,
  setCurrentChat,
  clearAllChats,
  addMemories,
  updateDraftInputText,
  setAutoGenerateAnswer,
  setProjectForChat,
  editMessageAndTruncate,
  setChatsFromSync,
} = chatsSlice.actions;

export default chatsSlice.reducer;
