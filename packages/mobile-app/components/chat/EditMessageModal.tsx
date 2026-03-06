/**
 * Modal component for editing message content.
 * Allows users to modify the text of existing messages.
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Colors } from '../../constants/Colors';
import { ThemedText } from '../ThemedText';

interface EditMessageModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: (newContent: string) => void;
  initialContent: string;
}

export function EditMessageModal({
  visible,
  onClose,
  onSave,
  initialContent,
}: EditMessageModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    if (visible) {
      setContent(initialContent);
    }
  }, [visible, initialContent]);

  const handleSave = () => {
    const trimmedContent = content.trim();
    if (trimmedContent && trimmedContent !== initialContent) {
      onSave(trimmedContent);
    }
    onClose();
  };

  const hasChanges = content.trim() !== initialContent;
  const isValid = content.trim().length > 0;

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
          <ThemedText style={styles.modalTitle}>Edit Message</ThemedText>

          <View style={styles.inputContainer}>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.text,
                  borderColor: theme.text + '20',
                  backgroundColor: theme.background,
                },
              ]}
              value={content}
              onChangeText={setContent}
              placeholder="Enter message content"
              placeholderTextColor={theme.text + '80'}
              multiline
              autoFocus
            />
          </View>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                { backgroundColor: theme.background, borderColor: theme.text + '20', borderWidth: 1 }
              ]}
              onPress={onClose}
            >
              <ThemedText>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                { backgroundColor: theme.tint },
                (!isValid || !hasChanges) && styles.disabledButton
              ]}
              onPress={handleSave}
              disabled={!isValid || !hasChanges}
            >
              <ThemedText
                style={[
                  styles.saveButtonText,
                  { color: colorScheme === 'light' ? 'white' : theme.text },
                  (!isValid || !hasChanges) && styles.disabledButtonText
                ]}
              >
                Save
              </ThemedText>
            </TouchableOpacity>
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
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
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
  saveButton: {
    marginLeft: 10,
  },
  saveButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
