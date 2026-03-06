import { useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import { deleteMessage } from "../redux/slices/chatsSlice";
import { selectCurrentMessages } from "../redux/slices/chatSelectors";

/**
 * Hook for accessing and managing messages in a chat.
 * Focused on message display and deletion only.
 *
 * For message sending, use useMessageSending hook.
 *
 * @param chatId - The ID of the chat
 * @returns Object containing messages and delete handler
 */
export const useMessages = (chatId: string) => {
  const dispatch = useDispatch();
  const messages = useSelector(selectCurrentMessages);

  const onDeleteMessage = useCallback(
    (messageIndex: number) => {
      dispatch(deleteMessage({ chatId, messageIndex }));
    },
    [chatId, dispatch]
  );

  return {
    messages,
    onDeleteMessage,
  };
};
