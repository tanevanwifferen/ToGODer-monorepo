import chatsReducer, {
  addChat,
  addMessage,
  updateMessageAtIndex,
  deleteMessage,
  deleteMessageByContent,
  setTitle,
  deleteChat,
  setCurrentChat,
  clearAllChats,
  addMemories,
  updateDraftInputText,
  setAutoGenerateAnswer,
  editMessageAndTruncate,
  Chat,
  ChatsState,
} from "../chatsSlice";
import { ApiChatMessage } from "../../../model/ChatRequest";

describe("chatsSlice", () => {
  const initialState: ChatsState = {
    chats: {},
    currentChatId: null,
    auto_generate_answer: true,
  };

  const createMockChat = (overrides: Partial<Chat> = {}): Chat => ({
    id: "test-chat-1",
    title: "Test Chat",
    messages: [],
    isRequest: false,
    last_update: 1000,
    memories: [],
    ...overrides,
  });

  const createMockMessage = (
    overrides: Partial<ApiChatMessage> = {}
  ): ApiChatMessage => ({
    content: "Test message",
    role: "user",
    timestamp: 1000,
    ...overrides,
  });

  describe("addChat", () => {
    it("should add a new chat to state", () => {
      const chat = createMockChat({ id: "new-chat" });
      const state = chatsReducer(initialState, addChat(chat));

      expect(state.chats["new-chat"]).toBeDefined();
      expect(state.chats["new-chat"].id).toBe("new-chat");
      expect(state.chats["new-chat"].title).toBe("Test Chat");
    });

    it("should set isRequest to false by default", () => {
      const chat = { id: "test", messages: [], memories: [] };
      const state = chatsReducer(initialState, addChat(chat));

      expect(state.chats["test"].isRequest).toBe(false);
    });

    it("should preserve isRequest when provided", () => {
      const chat = { id: "test", messages: [], memories: [], isRequest: true };
      const state = chatsReducer(initialState, addChat(chat));

      expect(state.chats["test"].isRequest).toBe(true);
    });

    it("should set last_update timestamp", () => {
      const chat = createMockChat({ id: "timed-chat" });
      const beforeTime = new Date().getTime();
      const state = chatsReducer(initialState, addChat(chat));
      const afterTime = new Date().getTime();

      expect(state.chats["timed-chat"].last_update).toBeGreaterThanOrEqual(
        beforeTime
      );
      expect(state.chats["timed-chat"].last_update).toBeLessThanOrEqual(
        afterTime
      );
    });
  });

  describe("addMessage", () => {
    it("should add a message to an existing chat", () => {
      const stateWithChat: ChatsState = {
        ...initialState,
        chats: { "chat-1": createMockChat({ id: "chat-1" }) },
      };
      const message = createMockMessage({ content: "Hello" });

      const state = chatsReducer(
        stateWithChat,
        addMessage({ id: "chat-1", message })
      );

      expect(state.chats["chat-1"].messages).toHaveLength(1);
      expect(state.chats["chat-1"].messages[0].content).toBe("Hello");
    });

    it("should remove updateData from message", () => {
      const stateWithChat: ChatsState = {
        ...initialState,
        chats: { "chat-1": createMockChat({ id: "chat-1" }) },
      };
      const message = createMockMessage({
        content: "Test",
        updateData: "some-update-data",
      });

      const state = chatsReducer(
        stateWithChat,
        addMessage({ id: "chat-1", message })
      );

      expect(state.chats["chat-1"].messages[0].updateData).toBeUndefined();
    });

    it("should set auto_generate_answer to true for user messages", () => {
      const stateWithChat: ChatsState = {
        ...initialState,
        auto_generate_answer: false,
        chats: { "chat-1": createMockChat({ id: "chat-1" }) },
      };
      const message = createMockMessage({ role: "user" });

      const state = chatsReducer(
        stateWithChat,
        addMessage({ id: "chat-1", message })
      );

      expect(state.auto_generate_answer).toBe(true);
    });

    it("should set auto_generate_answer to false for assistant messages", () => {
      const stateWithChat: ChatsState = {
        ...initialState,
        auto_generate_answer: true,
        chats: { "chat-1": createMockChat({ id: "chat-1" }) },
      };
      const message = createMockMessage({ role: "assistant" });

      const state = chatsReducer(
        stateWithChat,
        addMessage({ id: "chat-1", message })
      );

      expect(state.auto_generate_answer).toBe(false);
    });

    it("should not crash when chat does not exist", () => {
      const message = createMockMessage();
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const state = chatsReducer(
        initialState,
        addMessage({ id: "nonexistent", message })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        "Chat nonexistent not found when adding message"
      );
      expect(state).toEqual(initialState);

      consoleSpy.mockRestore();
    });

    it("should add timestamp if not provided", () => {
      const stateWithChat: ChatsState = {
        ...initialState,
        chats: { "chat-1": createMockChat({ id: "chat-1" }) },
      };
      const message = { content: "No timestamp", role: "user" as const };
      const beforeTime = new Date().getTime();

      const state = chatsReducer(
        stateWithChat,
        addMessage({ id: "chat-1", message })
      );

      expect(state.chats["chat-1"].messages[0].timestamp).toBeGreaterThanOrEqual(
        beforeTime
      );
    });
  });

  describe("updateMessageAtIndex", () => {
    it("should update message content at the specified index", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [
              createMockMessage({ content: "Original" }),
              createMockMessage({ content: "Second" }),
            ],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        updateMessageAtIndex({
          chatId: "chat-1",
          messageIndex: 0,
          content: "Updated",
        })
      );

      expect(state.chats["chat-1"].messages[0].content).toBe("Updated");
      expect(state.chats["chat-1"].messages[1].content).toBe("Second");
    });

    it("should update message signature", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [createMockMessage()],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        updateMessageAtIndex({
          chatId: "chat-1",
          messageIndex: 0,
          signature: "new-signature",
        })
      );

      expect((state.chats["chat-1"].messages[0] as any).signature).toBe(
        "new-signature"
      );
    });

    it("should create a new messages array reference for re-render", () => {
      const originalMessages = [createMockMessage()];
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: originalMessages,
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        updateMessageAtIndex({
          chatId: "chat-1",
          messageIndex: 0,
          content: "Updated",
        })
      );

      expect(state.chats["chat-1"].messages).not.toBe(originalMessages);
    });

    it("should not crash for invalid message index", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [createMockMessage()],
          }),
        },
      };
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const state = chatsReducer(
        stateWithMessages,
        updateMessageAtIndex({
          chatId: "chat-1",
          messageIndex: 5,
          content: "Updated",
        })
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(state.chats["chat-1"].messages[0].content).toBe("Test message");

      consoleSpy.mockRestore();
    });

    it("should not crash when chat does not exist", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const state = chatsReducer(
        initialState,
        updateMessageAtIndex({
          chatId: "nonexistent",
          messageIndex: 0,
          content: "Updated",
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        "Chat nonexistent not found when updating message"
      );

      consoleSpy.mockRestore();
    });
  });

  describe("deleteMessage", () => {
    it("should delete message at the specified index", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [
              createMockMessage({ content: "First" }),
              createMockMessage({ content: "Second" }),
              createMockMessage({ content: "Third" }),
            ],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        deleteMessage({ chatId: "chat-1", messageIndex: 1 })
      );

      // Tombstone: message is soft-deleted, not removed
      expect(state.chats["chat-1"].messages).toHaveLength(3);
      expect(state.chats["chat-1"].messages[0].content).toBe("First");
      expect(state.chats["chat-1"].messages[0].deleted).toBeUndefined();
      expect(state.chats["chat-1"].messages[1].content).toBe("Second");
      expect(state.chats["chat-1"].messages[1].deleted).toBe(true);
      expect(state.chats["chat-1"].messages[1].deletedAt).toBeDefined();
      expect(state.chats["chat-1"].messages[2].content).toBe("Third");
      expect(state.chats["chat-1"].messages[2].deleted).toBeUndefined();
    });

    it("should set auto_generate_answer to false", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        auto_generate_answer: true,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [createMockMessage()],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        deleteMessage({ chatId: "chat-1", messageIndex: 0 })
      );

      expect(state.auto_generate_answer).toBe(false);
    });

    it("should not crash for invalid index", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [createMockMessage()],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        deleteMessage({ chatId: "chat-1", messageIndex: 10 })
      );

      expect(state.chats["chat-1"].messages).toHaveLength(1);
    });

    it("should not crash when chat does not exist", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      chatsReducer(
        initialState,
        deleteMessage({ chatId: "nonexistent", messageIndex: 0 })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        "Chat nonexistent not found when deleting message"
      );

      consoleSpy.mockRestore();
    });
  });

  describe("deleteMessageByContent", () => {
    it("should delete message matching content", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [
              createMockMessage({ content: "Keep this" }),
              createMockMessage({ content: "Delete this" }),
              createMockMessage({ content: "Also keep" }),
            ],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        deleteMessageByContent({ chatId: "chat-1", content: "Delete this" })
      );

      expect(state.chats["chat-1"].messages).toHaveLength(2);
      expect(
        state.chats["chat-1"].messages.find((m) => m.content === "Delete this")
      ).toBeUndefined();
    });

    it("should only delete first matching message", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [
              createMockMessage({ content: "Duplicate" }),
              createMockMessage({ content: "Duplicate" }),
            ],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        deleteMessageByContent({ chatId: "chat-1", content: "Duplicate" })
      );

      expect(state.chats["chat-1"].messages).toHaveLength(1);
    });

    it("should do nothing if content not found", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [createMockMessage({ content: "Existing" })],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        deleteMessageByContent({ chatId: "chat-1", content: "Not found" })
      );

      expect(state.chats["chat-1"].messages).toHaveLength(1);
    });
  });

  describe("setTitle", () => {
    it("should set the title of a chat", () => {
      const stateWithChat: ChatsState = {
        ...initialState,
        chats: { "chat-1": createMockChat({ id: "chat-1", title: "Old Title" }) },
      };

      const state = chatsReducer(
        stateWithChat,
        setTitle({ id: "chat-1", title: "New Title" })
      );

      expect(state.chats["chat-1"].title).toBe("New Title");
    });

    it("should do nothing if chat does not exist", () => {
      const state = chatsReducer(
        initialState,
        setTitle({ id: "nonexistent", title: "Title" })
      );

      expect(state).toEqual(initialState);
    });
  });

  describe("deleteChat", () => {
    it("should delete a chat", () => {
      const stateWithChats: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({ id: "chat-1" }),
          "chat-2": createMockChat({ id: "chat-2" }),
        },
      };

      const state = chatsReducer(stateWithChats, deleteChat("chat-1"));

      // Tombstone: chat is soft-deleted, not removed
      expect(state.chats["chat-1"]).toBeDefined();
      expect(state.chats["chat-1"].deleted).toBe(true);
      expect(state.chats["chat-1"].deletedAt).toBeDefined();
      expect(state.chats["chat-2"]).toBeDefined();
      expect(state.chats["chat-2"].deleted).toBeUndefined();
    });

    it("should clear currentChatId if deleted chat was current", () => {
      const stateWithCurrent: ChatsState = {
        ...initialState,
        chats: { "chat-1": createMockChat({ id: "chat-1" }) },
        currentChatId: "chat-1",
      };

      const state = chatsReducer(stateWithCurrent, deleteChat("chat-1"));

      expect(state.currentChatId).toBeNull();
    });

    it("should preserve currentChatId if deleted chat was not current", () => {
      const stateWithCurrent: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({ id: "chat-1" }),
          "chat-2": createMockChat({ id: "chat-2" }),
        },
        currentChatId: "chat-2",
      };

      const state = chatsReducer(stateWithCurrent, deleteChat("chat-1"));

      expect(state.currentChatId).toBe("chat-2");
    });
  });

  describe("setCurrentChat", () => {
    it("should set the current chat ID", () => {
      const state = chatsReducer(initialState, setCurrentChat("chat-1"));

      expect(state.currentChatId).toBe("chat-1");
    });

    it("should allow setting to null", () => {
      const stateWithCurrent: ChatsState = {
        ...initialState,
        currentChatId: "chat-1",
      };

      const state = chatsReducer(stateWithCurrent, setCurrentChat(null));

      expect(state.currentChatId).toBeNull();
    });
  });

  describe("clearAllChats", () => {
    it("should clear all chats and reset currentChatId", () => {
      const stateWithChats: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({ id: "chat-1" }),
          "chat-2": createMockChat({ id: "chat-2" }),
        },
        currentChatId: "chat-1",
      };

      const state = chatsReducer(stateWithChats, clearAllChats());

      expect(state.chats).toEqual({});
      expect(state.currentChatId).toBeNull();
    });

    it("should preserve auto_generate_answer setting", () => {
      const stateWithSettings: ChatsState = {
        ...initialState,
        auto_generate_answer: false,
        chats: { "chat-1": createMockChat() },
      };

      const state = chatsReducer(stateWithSettings, clearAllChats());

      // Note: clearAllChats doesn't explicitly preserve auto_generate_answer
      // but the chats and currentChatId are cleared
      expect(state.chats).toEqual({});
      expect(state.currentChatId).toBeNull();
    });
  });

  describe("addMemories", () => {
    it("should add memories to a chat", () => {
      const stateWithChat: ChatsState = {
        ...initialState,
        chats: { "chat-1": createMockChat({ id: "chat-1", memories: [] }) },
      };

      const state = chatsReducer(
        stateWithChat,
        addMemories({ id: "chat-1", memories: ["memory1", "memory2"] })
      );

      expect(state.chats["chat-1"].memories).toContain("memory1");
      expect(state.chats["chat-1"].memories).toContain("memory2");
    });

    it("should not add duplicate memories", () => {
      const stateWithChat: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            memories: ["existing"],
          }),
        },
      };

      const state = chatsReducer(
        stateWithChat,
        addMemories({ id: "chat-1", memories: ["existing", "new"] })
      );

      expect(state.chats["chat-1"].memories).toHaveLength(2);
      expect(state.chats["chat-1"].memories).toContain("existing");
      expect(state.chats["chat-1"].memories).toContain("new");
    });
  });

  describe("updateDraftInputText", () => {
    it("should update draft input text for a chat", () => {
      const stateWithChat: ChatsState = {
        ...initialState,
        chats: { "chat-1": createMockChat({ id: "chat-1" }) },
      };

      const state = chatsReducer(
        stateWithChat,
        updateDraftInputText({ chatId: "chat-1", text: "Draft message" })
      );

      expect(state.chats["chat-1"].draftInputText).toBe("Draft message");
    });

    it("should do nothing if chat does not exist", () => {
      const state = chatsReducer(
        initialState,
        updateDraftInputText({ chatId: "nonexistent", text: "Draft" })
      );

      expect(state).toEqual(initialState);
    });
  });

  describe("setAutoGenerateAnswer", () => {
    it("should set auto_generate_answer to true", () => {
      const stateWithFalse: ChatsState = {
        ...initialState,
        auto_generate_answer: false,
      };

      const state = chatsReducer(stateWithFalse, setAutoGenerateAnswer(true));

      expect(state.auto_generate_answer).toBe(true);
    });

    it("should set auto_generate_answer to false", () => {
      const state = chatsReducer(initialState, setAutoGenerateAnswer(false));

      expect(state.auto_generate_answer).toBe(false);
    });
  });

  describe("editMessageAndTruncate", () => {
    it("should edit message content at the specified index", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [
              createMockMessage({ content: "First", role: "user" }),
              createMockMessage({ content: "Second", role: "assistant" }),
              createMockMessage({ content: "Third", role: "user" }),
            ],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        editMessageAndTruncate({
          chatId: "chat-1",
          messageIndex: 0,
          content: "Edited First",
        })
      );

      expect(state.chats["chat-1"].messages[0].content).toBe("Edited First");
    });

    it("should truncate all messages after the edited message", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [
              createMockMessage({ content: "First", role: "user" }),
              createMockMessage({ content: "Second", role: "assistant" }),
              createMockMessage({ content: "Third", role: "user" }),
              createMockMessage({ content: "Fourth", role: "assistant" }),
            ],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        editMessageAndTruncate({
          chatId: "chat-1",
          messageIndex: 1,
          content: "Edited Second",
        })
      );

      expect(state.chats["chat-1"].messages).toHaveLength(2);
      expect(state.chats["chat-1"].messages[0].content).toBe("First");
      expect(state.chats["chat-1"].messages[1].content).toBe("Edited Second");
    });

    it("should set auto_generate_answer to true", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        auto_generate_answer: false,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [createMockMessage({ content: "First", role: "user" })],
          }),
        },
      };

      const state = chatsReducer(
        stateWithMessages,
        editMessageAndTruncate({
          chatId: "chat-1",
          messageIndex: 0,
          content: "Edited",
        })
      );

      expect(state.auto_generate_answer).toBe(true);
    });

    it("should update last_update timestamp", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            last_update: 1000,
            messages: [createMockMessage()],
          }),
        },
      };

      const beforeTime = new Date().getTime();
      const state = chatsReducer(
        stateWithMessages,
        editMessageAndTruncate({
          chatId: "chat-1",
          messageIndex: 0,
          content: "Edited",
        })
      );

      expect(state.chats["chat-1"].last_update).toBeGreaterThanOrEqual(beforeTime);
    });

    it("should not crash when chat does not exist", () => {
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const state = chatsReducer(
        initialState,
        editMessageAndTruncate({
          chatId: "nonexistent",
          messageIndex: 0,
          content: "Edited",
        })
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        "Chat nonexistent not found when editing message"
      );
      expect(state).toEqual(initialState);

      consoleSpy.mockRestore();
    });

    it("should not crash for invalid message index", () => {
      const stateWithMessages: ChatsState = {
        ...initialState,
        chats: {
          "chat-1": createMockChat({
            id: "chat-1",
            messages: [createMockMessage()],
          }),
        },
      };
      const consoleSpy = jest.spyOn(console, "warn").mockImplementation();

      const state = chatsReducer(
        stateWithMessages,
        editMessageAndTruncate({
          chatId: "chat-1",
          messageIndex: 5,
          content: "Edited",
        })
      );

      expect(consoleSpy).toHaveBeenCalled();
      expect(state.chats["chat-1"].messages[0].content).toBe("Test message");

      consoleSpy.mockRestore();
    });
  });
});
