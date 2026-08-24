import { useEffect, useState, useMemo } from "react";
import { useSelector } from "react-redux";
import {
  selectChats,
  selectChatRequests,
  selectChatList,
} from "../redux/slices/chatSelectors";
import { Chat, ChatsState } from "../redux/slices/chatsSlice";
import { selectProjects } from "../redux/slices/projectsSlice";

const selectChatsMap = (state: { chats: ChatsState }) => state.chats.chats;

/** Case-insensitive search over chat title + user/assistant message content (skip deleted). */
const matchesSearch = (chat: Chat, query: string): boolean => {
  if (chat.title?.toLowerCase().includes(query)) return true;
  return chat.messages.some(
    (msg) =>
      !msg.deleted &&
      (msg.role === "user" || msg.role === "assistant") &&
      msg.content?.toLowerCase().includes(query)
  );
};

export const useSortedChats = (searchQuery?: string) => {
  const chatRequests = useSelector(selectChatRequests);
  const regularChats = useSelector(selectChats);
  const chatsMap = useSelector(selectChatsMap);
  const projectsState = useSelector(selectProjects);
  const currentProjectId = projectsState.currentProjectId;

  const [sortedChatRequests, setSortedChatRequests] = useState<Chat[]>([]);
  const [sortedChats, setSortedChats] = useState<Chat[]>([]);

  const query = (searchQuery ?? "").toLowerCase().trim();

  // Filter chats by selected project, and always exclude incognito chats
  // (they never appear in the chat history list)
  const filteredChatRequests = useMemo(() => {
    let base = chatRequests.filter(chat => !chat.incognito);
    if (currentProjectId) {
      base = base.filter((chat) => chat.projectId === currentProjectId);
    }
    if (query) {
      base = base.filter((chat) => matchesSearch(chat, query));
    }
    return base;
  }, [chatRequests, currentProjectId, query]);

  const filteredRegularChats = useMemo(() => {
    let base = regularChats.filter(chat => !chat.incognito);
    if (currentProjectId) {
      base = base.filter((chat) => chat.projectId === currentProjectId);
    }
    if (query) {
      base = base.filter((chat) => matchesSearch(chat, query));
    }
    return base;
  }, [regularChats, currentProjectId, query]);

  function get_last_updated(chat: Chat) {
    return Math.max(
      (chat.messages[0]?.timestamp as number) ?? 0,
      (chat.messages[chat.messages.length - 1]?.timestamp as number) ?? 0
    );
  }

  useEffect(() => {
    const sortedRequests = [...filteredChatRequests].sort((a, b) =>
      (get_last_updated(b) ?? 0) - (get_last_updated(a) ?? 0) < 0 ? -1 : 1
    );
    setSortedChatRequests(sortedRequests);
  }, [filteredChatRequests]);

  useEffect(() => {
    const sorted = [...filteredRegularChats].sort((a, b) =>
      (get_last_updated(b) ?? 0) - (get_last_updated(a) ?? 0) < 0 ? -1 : 1
    );
    setSortedChats(sorted);
  }, [filteredRegularChats]);

  return {
    sortedChatRequests,
    sortedChats,
    hasRequests: filteredChatRequests.length > 0,
    chatsMap,
    currentProjectId,
  };
};
