/**
 * Modal component for sharing conversations.
 * Allows users to set a title and optional description before sharing.
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Colors } from '../../constants/Colors';
import { ThemedText } from '../ThemedText';
import { ThemedView } from '../ThemedView';
import { ShareRequest, ShareVisibility } from '../../model/ShareTypes';
import { useAuth } from '../../hooks/useAuth';
import { getShareUrl } from '@/constants/Env';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  onShare: (request: ShareRequest) => Promise<void>;
  initialTitle: string;
  messages: ShareRequest['messages'];
  isLoading?: boolean;
  sharedId?: string;
}

export function ShareModal({
  visible,
  onClose,
  onShare,
  initialTitle,
  messages,
  isLoading = false,
  sharedId,
}: ShareModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ShareVisibility>('PRIVATE');
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setDescription('');
      setVisibility('PRIVATE');
      setShowCopiedMessage(false);
    }
  }, [visible, initialTitle]);

  const shareUrlBase = getShareUrl();
  const shareUrl = sharedId && shareUrlBase ? `${shareUrlBase}/${sharedId}` : '';

  const handleCopyUrl = async () => {
    if (shareUrl) {
      await Clipboard.setStringAsync(shareUrl);
      setShowCopiedMessage(true);
      setTimeout(() => setShowCopiedMessage(false), 2000);
    }
  };

  const { isAuthenticated } = useAuth();

  const handleShare = async () => {
    if (isAuthenticated) {
      await onShare({
        title,
        description: description || undefined,
        messages,
        visibility,
      });
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.modalContainer}
      >
        <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
          <ThemedText style={styles.modalTitle}>Share Conversation</ThemedText>
          {!isAuthenticated && (
            <View style={styles.warningContainer}>
              <ThemedText style={[styles.warningText, { color: theme.tint }]}>
                ⚠️ You must be logged in to share conversations
              </ThemedText>
            </View>
          )}
          
          <View style={styles.inputContainer}>
            <ThemedText style={styles.label}>Title</ThemedText>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.text + '20',
                  backgroundColor: theme.background,
                },
              ]}
              value={title}
              onChangeText={setTitle}
              placeholder="Enter title"
              placeholderTextColor={theme.text + '80'}
            />
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={styles.label}>Visibility</ThemedText>
            <View style={styles.visibilityContainer}>
              <TouchableOpacity
                style={[
                  styles.visibilityButton,
                  visibility === 'PRIVATE' && styles.visibilityButtonActive,
                  { borderColor: theme.text + '20' },
                  visibility === 'PRIVATE' && { backgroundColor: theme.tint },
                ]}
                onPress={() => setVisibility('PRIVATE')}
              >
                <ThemedText
                  style={[
                    styles.visibilityButtonText,
                    visibility === 'PRIVATE' && [
                      styles.visibilityButtonTextActive,
                      { color: colorScheme === 'light' ? 'white' : theme.text }
                    ],
                  ]}
                >
                  Private
                </ThemedText>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.visibilityButton,
                  visibility === 'PUBLIC' && styles.visibilityButtonActive,
                  { borderColor: theme.text + '20' },
                  visibility === 'PUBLIC' && { backgroundColor: theme.tint },
                ]}
                onPress={() => setVisibility('PUBLIC')}
              >
                <ThemedText
                  style={[
                    styles.visibilityButtonText,
                    visibility === 'PUBLIC' && [
                      styles.visibilityButtonTextActive,
                      { color: colorScheme === 'light' ? 'white' : theme.text }
                    ],
                  ]}
                >
                  Public
                </ThemedText>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.inputContainer}>
            <ThemedText style={styles.label}>Description (optional)</ThemedText>
            <TextInput
              style={[
                styles.input,
                styles.descriptionInput,
                {
                  color: theme.text,
                  borderColor: theme.text + '20',
                  backgroundColor: theme.background,
                },
              ]}
              value={description}
              onChangeText={setDescription}
              placeholder="Enter description"
              placeholderTextColor={theme.text + '80'}
              multiline
              numberOfLines={3}
            />
          </View>

          {sharedId && (
            <View style={styles.urlContainer}>
              <ThemedText style={styles.label}>Share URL</ThemedText>
              <Pressable
                style={[styles.urlBox, { borderColor: theme.text + '20' }]}
                onPress={handleCopyUrl}
              >
                <ThemedText style={styles.urlText} numberOfLines={1}>
                  {shareUrl}
                </ThemedText>
                <ThemedText style={styles.copyText}>
                  {showCopiedMessage ? 'Copied!' : 'Tap to copy'}
                </ThemedText>
              </Pressable>
            </View>
          )}

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                { backgroundColor: theme.background, borderColor: theme.text + '20', borderWidth: 1 }
              ]}
              onPress={onClose}
              disabled={isLoading}
            >
              <ThemedText>Cancel</ThemedText>
            </TouchableOpacity>
            {sharedId ? (
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.shareButton,
                  { backgroundColor: theme.tint },
                ]}
                onPress={() => {
                  onClose();
                  router.push(`/shared/${sharedId}`);
                }}
              >
                <ThemedText style={[styles.shareButtonText, { color: colorScheme === 'light' ? 'white' : theme.text }]}>
                  Go to conversation
                </ThemedText>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.shareButton,
                  { backgroundColor: theme.tint },
                  (!isAuthenticated || !title.trim()) && styles.disabledButton
                ]}
                onPress={handleShare}
                disabled={!isAuthenticated || isLoading || !title.trim()}
                accessibilityHint={!isAuthenticated ? "You must be logged in to share conversations" : ""}
              >
                {isLoading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <ThemedText
                    style={[
                      styles.shareButtonText,
                      { color: colorScheme === 'light' ? 'white' : theme.text },
                      (!isAuthenticated || !title.trim()) && styles.disabledButtonText
                    ]}
                  >
                    Share
                  </ThemedText>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  disabledButton: {
    opacity: 0.5,
    backgroundColor: Colors.light.tabIconDefault,
  },
  disabledButtonText: {
    opacity: 0.7,
  },
  warningContainer: {
    marginBottom: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.light.tint + '40',
    backgroundColor: Colors.light.tint + '10',
  },
  warningText: {
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '500',
  },
  visibilityContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  visibilityButton: {
    flex: 1,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
  },
  visibilityButtonActive: {
    borderWidth: 0,
  },
  visibilityButtonText: {
    fontSize: 16,
  },
  visibilityButtonTextActive: {
    fontWeight: 'bold',
  },
  urlContainer: {
    marginBottom: 16,
  },
  urlBox: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  urlText: {
    flex: 1,
    fontSize: 14,
  },
  copyText: {
    fontSize: 14,
    marginLeft: 8,
    opacity: 0.7,
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    width: '90%',
    maxWidth: 500,
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 8,
    fontSize: 16,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  descriptionInput: {
    height: 100,
    textAlignVertical: 'top',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    marginRight: 10,
  },
  shareButton: {
    marginLeft: 10,
  },
  shareButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});