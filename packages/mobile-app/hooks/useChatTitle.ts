import { useEffect, useRef } from "react";
import { useSelector, useDispatch } from "react-redux";
import { setTitle } from "../redux/slices/chatsSlice";
import { ChatApiClient } from "../apiClients/ChatApiClient";
import { selectChatById } from "@/redux/slices/chatSelectors";
import { store } from "@/redux/store";
import { IMessage } from "react-native-gifted-chat";


/**
 * Hook to manage chat title fetching.
 *
 * Fetches a title from the API when:
 * 1. Chat has exactly 1 message (user just sent first message)
 * 2. Chat doesn't already have a title
 *
 * Uses refs to prevent duplicate fetches during rapid re-renders
 * (e.g., during message streaming).
 */
export const useChatTitle = (chatId: string): string | undefined => {
  const dispatch = useDispatch();
  const currentChat = useSelector((state: any) => selectChatById(state, chatId));

  // Extract primitive values to use as stable dependencies
  const chatTitle = currentChat?.title;
  const messageCount = currentChat?.messages?.length ?? 0;

  // Refs to track fetch state without causing re-renders
  const fetchingRef = useRef(false);
  const fetchedChatIdRef = useRef<string | null>(null);


  useEffect(() => {
    // Guard: need a valid chatId
    if (!chatId) return;

    // Guard: already has a title
    if (chatTitle) return;

    // Guard: only fetch when there's exactly 1 message
    // (user just sent first message, before assistant responds)
    if (messageCount !== 1) return;

    // Guard: already fetching
    if (fetchingRef.current) return;

    // Guard: already fetched for this chat
    if (fetchedChatIdRef.current === chatId) return;

    // Mark as fetching to prevent duplicate requests
    fetchingRef.current = true;

    // Get fresh messages from store at fetch time
    // (avoids stale closure issues)
    const state = store.getState();
    const chat = state.chats.chats[chatId];
    const messages = chat?.messages;

    if (!messages || messages.length === 0) {
      fetchingRef.current = false;
      return;
    }

    ChatApiClient.getTitle(messages)
      .then((title) => {
        dispatch(setTitle({ id: chatId, title }));
        fetchedChatIdRef.current = chatId;
      })
      .catch((error) => {
        console.error("Failed to fetch title:", error);
        // Don't mark as fetched on error, allowing retry on next trigger
      })
      .finally(() => {
        fetchingRef.current = false;
      });
  }, [chatId, chatTitle, messageCount, dispatch]);

  return chatTitle ?? undefined;
};
