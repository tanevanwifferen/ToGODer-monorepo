import { useEffect, useRef, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IMessage } from 'react-native-gifted-chat';
import { selectDraftInputText } from '../redux/slices/chatSelectors';
import { updateDraftInputText } from '../redux/slices/chatsSlice';
import { selectPrompts } from '../redux/slices/globalConfigSlice';
import { selectCustomSystemPrompt } from '../redux/slices/systemPromptSlice';

// Delay before persisting the draft to Redux. Keystrokes must stay out of
// Redux: every dispatch makes redux-persist re-serialize the whole chats
// slice, which lags the controlled input and drops trailing characters.
const DRAFT_PERSIST_DELAY_MS = 400;

/**
 * Hook for managing message input state and prompt suggestions.
 * Input text lives in local state for responsiveness; the draft is persisted
 * to Redux on a debounce so it survives chat switches and app restarts.
 *
 * @param chatId - The ID of the current chat
 * @param messages - The current messages in the chat (used for prompt visibility logic)
 * @returns Object containing input state, handlers, and prompt-related data
 */
export const useMessageInput = (chatId: string, messages: IMessage[]) => {
  const dispatch = useDispatch();
  const [showPrompts, setShowPrompts] = useState(false);

  // Draft persisted in Redux, used to seed local state per chat
  const persistedDraft = useSelector((state) => selectDraftInputText(state, chatId));

  const [inputText, setInputTextState] = useState(persistedDraft);
  // Always holds the latest typed text, even before React re-renders.
  // Send handlers read from this so a tap on Send never uses a stale value.
  const inputTextRef = useRef(inputText);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prompts = useSelector(selectPrompts);
  const customSystemPrompt = useSelector(selectCustomSystemPrompt);

  // Re-seed local state from the persisted draft when switching chats
  useEffect(() => {
    inputTextRef.current = persistedDraft;
    setInputTextState(persistedDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  // Flush any pending draft persist on unmount
  useEffect(() => {
    return () => {
      if (persistTimeoutRef.current) {
        clearTimeout(persistTimeoutRef.current);
        dispatch(updateDraftInputText({ chatId, text: inputTextRef.current }));
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatId]);

  /**
   * Updates local input state immediately and persists the draft to Redux
   * on a debounce.
   */
  const setInputText = (text: string) => {
    inputTextRef.current = text;
    setInputTextState(text);
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }
    persistTimeoutRef.current = setTimeout(() => {
      persistTimeoutRef.current = null;
      dispatch(updateDraftInputText({ chatId, text }));
    }, DRAFT_PERSIST_DELAY_MS);
  };

  /**
   * Handles input text changes with prompt visibility logic
   * Shows prompts when:
   * - Input starts with '/'
   * - Input doesn't contain spaces
   * - Chat has no messages (empty chat)
   */
  const handleInputTextChanged = (text: string) => {
    setInputText(text);
    if (text.startsWith('/') && !text.includes(' ') && messages.length === 0) {
      setShowPrompts(true);
    } else {
      setShowPrompts(false);
    }
  };

  /**
   * Handles prompt selection from suggestions
   * Updates input text and hides prompt suggestions
   */
  const handleSelectPrompt = (promptKey: string) => {
    setInputText(promptKey);
    setShowPrompts(false);
  };

  /**
   * Clears the input text immediately, cancelling any pending draft persist
   * so a stale draft can't resurface after send.
   */
  const clearInput = () => {
    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
      persistTimeoutRef.current = null;
    }
    inputTextRef.current = '';
    setInputTextState('');
    dispatch(updateDraftInputText({ chatId, text: '' }));
  };

  /**
   * Filters and returns prompts based on current input text
   * Includes custom system prompt if it matches the filter
   */
  const filteredPrompts = showPrompts
    ? (() => {
        // Start with regular prompts
        let allPrompts = Object.entries(prompts)
          .filter(([key, value]) => value.display)
          .filter(([key]) => key.includes(inputText));

        // Add custom system prompt if it exists and matches the filter
        if (customSystemPrompt && '/custom'.includes(inputText)) {
          allPrompts.unshift(['/custom', {
            prompt: '/custom',
            description: 'custom personalized prompt',
            display: true
          }]);
        }

        return allPrompts;
      })()
    : [];

  return {
    inputText,
    inputTextRef,
    setInputText,
    showPrompts,
    filteredPrompts,
    handleInputTextChanged,
    handleSelectPrompt,
    clearInput,
  };
};
