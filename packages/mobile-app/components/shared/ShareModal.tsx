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
  ScrollView,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Colors } from '../../constants/Colors';
import { ThemedText } from '../ThemedText';
import { ThemedView } from '../ThemedView';
import { ShareRecord, ShareRequest, ShareVisibility } from '../../model/ShareTypes';
import { useAuth } from '../../hooks/useAuth';
import { getShareUrl } from '@/constants/Env';

interface ShareModalProps {
  visible: boolean;
  onClose: () => void;
  onShare: (request: ShareRequest) => Promise<void>;
  initialTitle: string;
  messages?: ShareRequest['messages'];
  isLoading?: boolean;
  sharedId?: string;
  // What is being shared, e.g. "Conversation" (default) or "Artifact".
  entityLabel?: string;
  // Route segment appended after /shared for viewing, e.g. "artifact".
  pathPrefix?: string;
  // Earlier publishes of this item, oldest first. Shown so users can revisit
  // or copy links of previous versions (each publish is its own instance).
  shareHistory?: ShareRecord[];
  // Admin-only Payload publish support
  isAdmin?: boolean;
  payloadType?: 'chat' | 'artifact' | 'folder';
  onPublishToPayload?: () => Promise<void>;
}

export function ShareModal({
  visible,
  onClose,
  onShare,
  initialTitle,
  messages = [],
  isLoading = false,
  sharedId,
  entityLabel = 'Conversation',
  pathPrefix,
  shareHistory = [],
  isAdmin = false,
  payloadType,
  onPublishToPayload,
}: ShareModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<ShareVisibility>('PRIVATE');
  const [showCopiedMessage, setShowCopiedMessage] = useState(false);
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
  const [payloadPublishing, setPayloadPublishing] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle(initialTitle);
      setDescription('');
      setVisibility('PRIVATE');
      setShowCopiedMessage(false);
      setCopiedHistoryId(null);
    }
  }, [visible, initialTitle]);

  const shareUrlBase = getShareUrl();
  const pathFor = (id: string) => (pathPrefix ? `${pathPrefix}/${id}` : id);
  const sharePath = pathFor(sharedId ?? '');
  const shareUrl = sharedId && shareUrlBase ? `${shareUrlBase}/${sharePath}` : '';

  const handleCopyUrl = async () => {
    if (shareUrl) {
      await Clipboard.setStringAsync(shareUrl);
      setShowCopiedMessage(true);
      setTimeout(() => setShowCopiedMessage(false), 2000);
    }
  };

  const handleCopyHistoryUrl = async (record: ShareRecord) => {
    if (!shareUrlBase) return;
    await Clipboard.setStringAsync(`${shareUrlBase}/${pathFor(record.sharedId)}`);
    setCopiedHistoryId(record.sharedId);
    setTimeout(() => setCopiedHistoryId(null), 2000);
  };

  const handleOpenHistory = (record: ShareRecord) => {
    onClose();
    router.push(`/shared/${pathFor(record.sharedId)}`);
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
          <ThemedText style={styles.modalTitle}>Share {entityLabel}</ThemedText>
          {!isAuthenticated && (
            <View style={styles.warningContainer}>
              <ThemedText style={[styles.warningText, { color: theme.tint }]}>
                ⚠️ You must be logged in to share
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

          {!sharedId && shareHistory.length > 0 && (
            <View style={styles.inputContainer}>
              <ThemedText style={styles.label}>
                Previous shares ({shareHistory.length})
              </ThemedText>
              <ScrollView style={[styles.historyList, { borderColor: theme.text + '20' }]}>
                {[...shareHistory].reverse().map((record) => (
                  <View
                    key={record.sharedId}
                    style={styles.historyRow}
                  >
                    <TouchableOpacity
                      style={styles.historyInfo}
                      onPress={() => handleOpenHistory(record)}
                    >
                      <ThemedText style={styles.historyTitle} numberOfLines={1}>
                        {record.title}
                      </ThemedText>
                      <ThemedText style={styles.historyDate}>
                        {new Date(record.sharedAt).toLocaleString()}
                      </ThemedText>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleCopyHistoryUrl(record)}
                      style={styles.historyCopyButton}
                    >
                      <ThemedText style={[styles.historyCopyText, { color: theme.tint }]}>
                        {copiedHistoryId === record.sharedId ? 'Copied!' : 'Copy link'}
                      </ThemedText>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}

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

          {/* Admin-only Publish to Payload */}
          {sharedId && isAdmin && payloadType && (
            <View style={styles.urlContainer}>
              <ThemedText style={styles.label}>
                Publish to Payload (admin)
              </ThemedText>
              <TouchableOpacity
                style={[
                  styles.payloadButton,
                  { backgroundColor: theme.tint },
                ]}
                onPress={async () => {
                  if (!onPublishToPayload) return;
                  setPayloadPublishing(true);
                  try {
                    await onPublishToPayload();
                  } finally {
                    setPayloadPublishing(false);
                  }
                }}
                disabled={payloadPublishing}
              >
                {payloadPublishing ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <ThemedText
                    style={[
                      styles.payloadButtonText,
                      { color: colorScheme === 'light' ? 'white' : theme.text },
                    ]}
                  >
                    Publish to Payload
                  </ThemedText>
                )}
              </TouchableOpacity>
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
                  router.push(`/shared/${sharePath}`);
                }}
              >
                <ThemedText style={[styles.shareButtonText, { color: colorScheme === 'light' ? 'white' : theme.text }]}>
                  Go to {entityLabel.toLowerCase()}
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
                accessibilityHint={!isAuthenticated ? "You must be logged in to share" : ""}
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
  historyList: {
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 160,
    overflow: 'hidden',
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  historyInfo: {
    flex: 1,
  },
  historyTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  historyDate: {
    fontSize: 12,
    opacity: 0.6,
  },
  historyCopyButton: {
    paddingVertical: 4,
    paddingLeft: 8,
  },
  historyCopyText: {
    fontSize: 13,
    fontWeight: '500',
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
  payloadButton: {
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  payloadButtonText: {
    fontWeight: 'bold',
  },
});