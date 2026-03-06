/**
 * Component for displaying a shared conversation in read-only mode.
 * Shows the conversation title, description, messages, and owner information.
 */

import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import CustomAlert from '../ui/CustomAlert';
import { router } from 'expo-router';
import { useDispatch, useSelector } from 'react-redux';
import { useColorScheme } from '../../hooks/useColorScheme';
import { selectUserId } from '../../redux/slices/authSlice';
import { Colors } from '../../constants/Colors';
import { ThemedText } from '../ThemedText';
import { ThemedView } from '../ThemedView';
import { SharedConversation } from '../../model/ShareTypes';
import { ShareApiClient } from '../../apiClients/ShareApiClient';
import { addChat, setCurrentChat } from '../../redux/slices/chatsSlice';
import Toast from 'react-native-toast-message';
import { useQueryClient } from '@tanstack/react-query';
import { v4 as uuidv4 } from 'uuid';

interface SharedConversationViewProps {
  conversation: SharedConversation;
  onBack: () => void;
}

export function SharedConversationView({ conversation, onBack }: SharedConversationViewProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const currentUserId = useSelector(selectUserId);
  const isOwner = currentUserId === conversation.ownerId;
  const queryClient = useQueryClient();
  const dispatch = useDispatch();

  const handleCopy = () => {
    // Create a new chat ID
    const newChatId = uuidv4();

    // Parse messages and transform to ApiChatMessage format
    const messages = JSON.parse(conversation.messages).map((msg: any) => ({
      role: msg.message.role,
      content: msg.message.content,
      timestamp: new Date().getTime()
    }));

    // Add the chat to Redux store and set as current
    dispatch(addChat({
      id: newChatId,
      title: conversation.title,
      messages,
      memories: [],
      isRequest: false
    }));
    dispatch(setCurrentChat(newChatId));

    Toast.show({
      type: 'success',
      text1: 'Conversation copied to your chats',
    });

    // Navigate to chat view and then close shared view
    router.replace('/');
    onBack();
  };

  const handleDelete = () => {
    CustomAlert.alert(
      'Delete Conversation',
      'Are you sure you want to delete this shared conversation? This action cannot be undone.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ShareApiClient.deleteSharedConversation(conversation.id);
              // Invalidate the shared conversations query to trigger a refresh
              queryClient.invalidateQueries({ queryKey: ['shared-conversations'] });
              Toast.show({
                type: 'success',
                text1: 'Conversation deleted successfully',
              });
              onBack();
            } catch (error) {
              Toast.show({
                type: 'error',
                text1: 'Failed to delete conversation',
                text2: error instanceof Error ? error.message : 'Unknown error occurred',
              });
            }
          },
        },
      ],
      { cancelable: false }
    );
  };

  // Parse messages from JSON string
  const messages = JSON.parse(conversation.messages);

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.text + '20' }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ThemedText>← Back</ThemedText>
        </TouchableOpacity>
        <View style={styles.buttonContainer}>
          {isOwner && (
            <TouchableOpacity
              onPress={handleDelete}
              style={[styles.deleteButton, { backgroundColor: theme.error }]}
            >
              <ThemedText style={[styles.buttonText, { color: 'white' }]}>Delete</ThemedText>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={handleCopy}
            style={[styles.copyButton, { backgroundColor: Colors.light.tint }]}
          >
            <ThemedText style={[styles.buttonText, { color: colorScheme === 'dark' ? Colors.dark.text : 'white' }]}>Copy to My Chats</ThemedText>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.content}>
        <ThemedText style={styles.title}>{conversation.title}</ThemedText>
        
        {conversation.description && (
          <ThemedText style={styles.description}>{conversation.description}</ThemedText>
        )}

        <View style={styles.metadata}>
          <ThemedText style={styles.metadataText}>
            {new Date(conversation.createdAt).toLocaleDateString()}
          </ThemedText>
          <ThemedText style={styles.metadataText}>
            {conversation.views} views
          </ThemedText>
        </View>

        <View style={styles.messagesContainer}>
          {messages.map((msg: any, index: number) => (
            <View
              key={index}
              style={[
                styles.messageContainer,
                {
                  backgroundColor: msg.message.role === 'assistant' ? theme.text + '10' : 'transparent',
                },
              ]}
            >
              <ThemedText style={styles.messageRole}>
                {msg.message.role === 'assistant' ? 'Assistant' : 'User'}
              </ThemedText>
              <ThemedText style={styles.messageContent}>
                {msg.message.content}
              </ThemedText>
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingVertical: 8,
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  copyButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  buttonText: {
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 16,
    marginBottom: 16,
  },
  metadata: {
    marginBottom: 24,
  },
  metadataText: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 4,
  },
  messagesContainer: {
    gap: 16,
  },
  messageContainer: {
    padding: 16,
    borderRadius: 8,
  },
  messageRole: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  messageContent: {
    fontSize: 16,
  },
});