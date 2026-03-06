/**
 * Dynamic route handler for shared conversation details.
 * Displays a specific shared conversation when accessed via URL.
 */

import React, { useLayoutEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useSharedConversation } from '../../query-hooks/useSharedConversations';
import { SharedConversationView } from '../../components/shared/SharedConversationView';
import { ThemedView } from '../../components/ThemedView';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Colors } from '../../constants/Colors';

export default function SharedConversationScreen() {
  const { id } = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const navigation = useNavigation();

  const {
    data: conversation,
    isLoading,
  } = useSharedConversation(id as string);

  // Update the navigation title when conversation data is available
  useLayoutEffect(() => {
    if (conversation?.title) {
      navigation.setOptions({
        title: conversation.title
      });
    }
  }, [navigation, conversation?.title]);

  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.tint} />
      </ThemedView>
    );
  }

  if (!conversation) {
    return null;
  }

  return (
    <SharedConversationView
      conversation={conversation}
      onBack={() => router.replace('/shared')}
    />
  );
}