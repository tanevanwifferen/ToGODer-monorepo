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

export const useSortedChats = () => {
  const chatRequests = useSelector(selectChatRequests);
  const regularChats = useSelector(selectChats);
  const chatsMap = useSelector(selectChatsMap);
  const projectsState = useSelector(selectProjects);
  const currentProjectId = projectsState.currentProjectId;

  const [sortedChatRequests, setSortedChatRequests] = useState<Chat[]>([]);
  const [sortedChats, setSortedChats] = useState<Chat[]>([]);

  // Filter chats by selected project, and always exclude incognito chats
  // (they never appear in the chat history list)
  const filteredChatRequests = useMemo(() => {
    const base = chatRequests.filter(chat => !chat.incognito);
    if (!currentProjectId) {
      // No project selected - show all chat requests (non-incognito)
      return base;
    }
    // Filter to only show chat requests belonging to the selected project
    return base.filter((chat) => chat.projectId === currentProjectId);
  }, [chatRequests, currentProjectId]);

  const filteredRegularChats = useMemo(() => {
    const base = regularChats.filter(chat => !chat.incognito);
    if (!currentProjectId) {
      // No project selected - show all chats (non-incognito)
      return base;
    }
    // Filter to only show chats belonging to the selected project
    return base.filter((chat) => chat.projectId === currentProjectId);
  }, [regularChats, currentProjectId]);

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
