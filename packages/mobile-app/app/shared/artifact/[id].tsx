/**
 * Dynamic route handler for shared artifact details.
 * Displays a specific shared artifact when accessed via URL.
 */

import React, { useLayoutEffect } from 'react';
import { ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router, useNavigation } from 'expo-router';
import { useSharedArtifact } from '../../../query-hooks/useSharedConversations';
import { SharedArtifactView } from '../../../components/shared/SharedArtifactView';
import { ThemedView } from '../../../components/ThemedView';
import { useColorScheme } from '../../../hooks/useColorScheme';
import { Colors } from '../../../constants/Colors';

export default function SharedArtifactScreen() {
  const { id } = useLocalSearchParams();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const navigation = useNavigation();

  const { data: artifact, isLoading } = useSharedArtifact(id as string);

  // Update the navigation title when artifact data is available
  useLayoutEffect(() => {
    if (artifact?.title) {
      navigation.setOptions({
        title: artifact.title,
      });
    }
  }, [navigation, artifact?.title]);

  if (isLoading) {
    return (
      <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={theme.tint} />
      </ThemedView>
    );
  }

  if (!artifact) {
    return null;
  }

  return (
    <SharedArtifactView
      artifact={artifact}
      onBack={() => router.replace('/shared')}
    />
  );
}
