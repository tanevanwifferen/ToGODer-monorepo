/**
 * Shared conversations screen accessible from the drawer navigation.
 * Displays a list of publicly shared conversations with infinite scrolling.
 */

import React from 'react';
import { StyleSheet, View, FlatList, ActivityIndicator, RefreshControl, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Colors } from '../../constants/Colors';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { useSharedConversationsList } from '../../query-hooks/useSharedConversations';
import { SharedConversation } from '../../model/ShareTypes';
import { SharedConversationView } from '../../components/shared/SharedConversationView';

function SharedConversationItem({
  conversation,
  onPress,
}: {
  conversation: SharedConversation;
  onPress: () => void;
}) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.itemContainer, { borderBottomColor: theme.text + '20' }]}
    >
      <ThemedText style={styles.title}>{conversation.title}</ThemedText>
      {conversation.description && (
        <ThemedText style={styles.description} numberOfLines={2}>
          {conversation.description}
        </ThemedText>
      )}
      <View style={styles.metadata}>
        <ThemedText style={styles.metadataText}>
          {new Date(conversation.createdAt).toLocaleDateString()}
        </ThemedText>
        <ThemedText style={styles.metadataText}>
          {conversation.views} views
        </ThemedText>
      </View>
    </TouchableOpacity>
  );
}

export default function SharedScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const {
    data,
    isLoading,
    isError,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
    refetch,
    isRefetching,
  } = useSharedConversationsList();

  const loadMore = () => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  };

  if (isLoading) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ActivityIndicator size="large" color={theme.tint} />
      </ThemedView>
    );
  }

  if (isError) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ThemedText>Failed to load shared conversations</ThemedText>
      </ThemedView>
    );
  }

  const allConversations = data?.pages.flatMap((page) => page.chats) ?? [];

  if (allConversations.length === 0) {
    return (
      <ThemedView style={styles.centerContainer}>
        <ThemedText>No shared conversations yet</ThemedText>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={allConversations}
        renderItem={({ item }) => (
          <SharedConversationItem
            conversation={item}
            onPress={() => router.push(`/shared/${item.id}`)}
          />
        )}
        keyExtractor={item => item.id}
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor={theme.tint}
          />
        }
        ListFooterComponent={
          isFetchingNextPage ? (
            <ActivityIndicator style={styles.footer} color={theme.tint} />
          ) : null
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemContainer: {
    padding: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    marginBottom: 8,
  },
  metadata: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metadataText: {
    fontSize: 12,
    opacity: 0.7,
  },
  footer: {
    padding: 16,
  },
});