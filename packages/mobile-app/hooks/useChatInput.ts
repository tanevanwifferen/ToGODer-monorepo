/**
 * Hook for managing persistent chat input state.
 * This hook allows the chat input text to persist in Redux state when a user navigates away
 * and returns to a conversation.
 */
import { useSelector, useDispatch } from 'react-redux';
import { selectDraftInputText } from '../redux/slices/chatSelectors';
import { updateDraftInputText } from '../redux/slices/chatsSlice';

export const useChatInput = (chatId: string) => {
  const dispatch = useDispatch();
  
  // Get draft input text from Redux state for this specific chat
  const inputText = useSelector((state) => selectDraftInputText(state, chatId));

  // Handler to update the draft input text in Redux
  const setInputText = (text: string) => {
    dispatch(updateDraftInputText({ chatId, text }));
  };

  return {
    inputText,
    setInputText,
  };
};