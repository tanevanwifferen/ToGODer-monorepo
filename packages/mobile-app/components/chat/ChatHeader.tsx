/**
 * Header component for the chat screen.
 * Displays the chat title and provides navigation and sharing functionality.
 */

import React from 'react';
import { StyleSheet, View, TouchableOpacity, Text, useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import { useShareConversation } from '../../query-hooks/useSharedConversations';
import { ShareModal } from '../shared/ShareModal';
import { ApiChatMessage } from '../../model/ChatRequest';
import { ShareRequest, SignedMessage } from '../../model/ShareTypes';
import Toast from 'react-native-toast-message';
import { useAuth } from '../../hooks/useAuth';

interface ChatHeaderProps {
  title: string | undefined;
  onBack: () => void;
  messages: ApiChatMessage[];
}

export function ChatHeader({ title = 'Chat', onBack, messages }: ChatHeaderProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { isAuthenticated } = useAuth();
  const [showLoginHint, setShowLoginHint] = React.useState(false);

  const handleSharePress = () => {
    if (isAuthenticated) {
      setIsModalVisible(true);
    } else {
      setShowLoginHint(true);
      setTimeout(() => setShowLoginHint(false), 2000); // Hide after 2 seconds
    }
  };

  const {
    shareConversation,
    isLoading,
    isModalVisible,
    setIsModalVisible,
    sharedConversation,
  } = useShareConversation();

  const handleShare = async (request: ShareRequest) => {
    try {
      await shareConversation(request);
      Toast.show({
        type: 'success',
        text1: 'Conversation shared successfully',
      });
    } catch (error) {
      Toast.show({
        type: 'error',
        text1: 'Failed to share conversation',
        text2: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  };

  // Convert API messages to the format expected by the share API
  // The backend will handle signature generation
  const signedMessages: SignedMessage[] = messages.map(msg => ({
    message: {
      role: msg.role,
      content: msg.content,
    },
    signature: msg.signature ?? "", // Backend will generate and validate signatures
  }));

  return (
    <>
      <View style={[
        styles.header,
        {
          backgroundColor: theme.background,
          borderBottomColor: colorScheme === 'dark' ? '#2D2D2D' : '#e0e0e0'
        }
      ]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <Text style={[styles.backButtonText, { color: theme.text }]}>← Back</Text>
        </TouchableOpacity>
        <View style={styles.titleContainer}>
          <Text style={[styles.headerTitle, { color: theme.text }]} numberOfLines={1}>{title}</Text>
        </View>
        <View style={styles.shareContainer}>
          <TouchableOpacity
            onPress={handleSharePress}
            style={[
              styles.shareButton,
              !isAuthenticated && { opacity: 0.5 }
            ]}
          >
            <Text style={[styles.shareButtonText, { color: theme.text }]}>Share</Text>
          </TouchableOpacity>
          {showLoginHint && !isAuthenticated && (
            <Text style={[styles.loginHint, { color: theme.text, opacity: 0.7 }]}>
              Login to share
            </Text>
          )}
        </View>
      </View>

      <ShareModal
        visible={isModalVisible}
        onClose={() => setIsModalVisible(false)}
        onShare={handleShare}
        initialTitle={title}
        messages={signedMessages}
        isLoading={isLoading}
        sharedId={sharedConversation?.id}
      />
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
  },
  backButton: {
    paddingVertical: 8,
    minWidth: 60,
  },
  backButtonText: {
    fontSize: 16,
  },
  titleContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  shareButton: {
    paddingVertical: 8,
    minWidth: 60,
    alignItems: 'flex-end',
  },
  shareButtonText: {
    fontSize: 16,
  },
  shareContainer: {
    alignItems: 'center',
    minWidth: 60,
  },
  loginHint: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'center',
  },
});
