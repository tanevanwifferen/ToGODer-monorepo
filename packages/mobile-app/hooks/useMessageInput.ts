import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { IMessage } from 'react-native-gifted-chat';
import { selectDraftInputText } from '../redux/slices/chatSelectors';
import { updateDraftInputText } from '../redux/slices/chatsSlice';
import { selectPrompts } from '../redux/slices/globalConfigSlice';
import { selectCustomSystemPrompt } from '../redux/slices/systemPromptSlice';

/**
 * Hook for managing message input state and prompt suggestions.
 * Consolidates input text persistence (Redux) and prompt filtering behavior.
 *
 * @param chatId - The ID of the current chat
 * @param messages - The current messages in the chat (used for prompt visibility logic)
 * @returns Object containing input state, handlers, and prompt-related data
 */
export const useMessageInput = (chatId: string, messages: IMessage[]) => {
  const dispatch = useDispatch();
  const [showPrompts, setShowPrompts] = useState(false);

  // Get draft input text from Redux state for this specific chat
  const inputText = useSelector((state) => selectDraftInputText(state, chatId));
  const prompts = useSelector(selectPrompts);
  const customSystemPrompt = useSelector(selectCustomSystemPrompt);

  /**
   * Updates the input text in Redux state
   */
  const setInputText = (text: string) => {
    dispatch(updateDraftInputText({ chatId, text }));
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
   * Clears the input text
   */
  const clearInput = () => {
    setInputText('');
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
    setInputText,
    showPrompts,
    filteredPrompts,
    handleInputTextChanged,
    handleSelectPrompt,
    clearInput,
  };
};
