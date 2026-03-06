/**
 * Dynamic route handler for chat details.
 * Displays a specific chat when accessed via URL.
 */

import React, { useLayoutEffect } from 'react';
import { router, useNavigation, useLocalSearchParams } from 'expo-router';
import { useSelector, useDispatch } from 'react-redux';
import { Chat } from '../../../components/Chat';
import { selectChatById } from '../../../redux/slices/chatSelectors';
import { RootState } from '../../../redux/store';
import { setCurrentChat } from '../../../redux/slices/chatsSlice';

export default function ChatScreen() {
  const { id } = useLocalSearchParams();
  const chatId = id as string;
  const dispatch = useDispatch();
  const navigation = useNavigation();

  const chat = useSelector((state: RootState) => selectChatById(state, chatId));

  // Set current chat when entering this route
  React.useEffect(() => {
    dispatch(setCurrentChat(chatId));
  }, [dispatch, chatId]);

  // Update the navigation title when chat title is available
  useLayoutEffect(() => {
    if (chat?.title) {
      navigation.setOptions({
        title: chat.title
      });
    }
  }, [navigation, chat?.title]);

  const handleBack = () => {
    dispatch(setCurrentChat(null));
    router.back();
  };

  // Handle case where chat doesn't exist (deleted or invalid URL)
  if (!chat) {
    router.replace('/');
    return null;
  }

  return <Chat chatId={chatId} onBack={handleBack} />;
}
