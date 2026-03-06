import { useState } from 'react';
import { useSelector } from 'react-redux';
import { selectPrompts } from '../redux/slices/globalConfigSlice';
import { selectCustomSystemPrompt } from '../redux/slices/systemPromptSlice';
import { IMessage } from 'react-native-gifted-chat';

export const usePrompts = (messages: IMessage[], inputText: string, onInputTextChange: (text: string) => void) => {
  const [showPrompts, setShowPrompts] = useState(false);
  const prompts = useSelector(selectPrompts);
  const customSystemPrompt = useSelector(selectCustomSystemPrompt);

  const handleInputTextChanged = (text: string) => {
    onInputTextChange(text);
    if (text.startsWith('/') && !text.includes(' ') && messages.length === 0) {
      setShowPrompts(true);
    } else {
      setShowPrompts(false);
    }
  };

  const handleSelectPrompt = (promptKey: string) => {
    onInputTextChange(promptKey);
    setShowPrompts(false);
  };

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
    showPrompts,
    inputText,
    filteredPrompts,
    handleInputTextChanged,
    handleSelectPrompt
  };
};
