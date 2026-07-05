/**
 * Component for displaying a shared artifact in read-only mode.
 * Shows the artifact title, description, content, and the signed history of
 * custom instructions that were active while it was created.
 */

import React from 'react';
import {
  StyleSheet,
  View,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import CustomAlert from '../ui/CustomAlert';
import { useSelector } from 'react-redux';
import { useColorScheme } from '../../hooks/useColorScheme';
import { selectUserId } from '../../redux/slices/authSlice';
import { Colors } from '../../constants/Colors';
import { ThemedText } from '../ThemedText';
import { ThemedView } from '../ThemedView';
import { MermaidMessageContent } from '../chat/mermaid/MermaidMessageContent';
import { SharedArtifact, parseInstructionHistory } from '../../model/ShareTypes';
import { ShareApiClient } from '../../apiClients/ShareApiClient';
import { InstructionHistorySection } from './InstructionHistorySection';
import Toast from 'react-native-toast-message';

interface SharedArtifactViewProps {
  artifact: SharedArtifact;
  onBack: () => void;
}

export function SharedArtifactView({ artifact, onBack }: SharedArtifactViewProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const currentUserId = useSelector(selectUserId);
  const isOwner = currentUserId === artifact.ownerId;

  const handleDelete = () => {
    CustomAlert.alert(
      'Delete Artifact',
      'Are you sure you want to delete this shared artifact? This action cannot be undone.',
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
              await ShareApiClient.deleteSharedArtifact(artifact.id);
              Toast.show({
                type: 'success',
                text1: 'Artifact deleted successfully',
              });
              onBack();
            } catch (error) {
              Toast.show({
                type: 'error',
                text1: 'Failed to delete artifact',
                text2: error instanceof Error ? error.message : 'Unknown error occurred',
              });
            }
          },
        },
      ],
      { cancelable: false }
    );
  };

  const instructionHistory = parseInstructionHistory(
    artifact.instructionHistory
  );

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { borderBottomColor: theme.text + '20' }]}>
        <TouchableOpacity onPress={onBack} style={styles.backButton}>
          <ThemedText>← Back</ThemedText>
        </TouchableOpacity>
        {isOwner && (
          <TouchableOpacity
            onPress={handleDelete}
            style={[styles.deleteButton, { backgroundColor: theme.error }]}
          >
            <ThemedText style={[styles.buttonText, { color: 'white' }]}>Delete</ThemedText>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.content}>
        <ThemedText style={styles.title}>{artifact.title}</ThemedText>

        {artifact.description && (
          <ThemedText style={styles.description}>{artifact.description}</ThemedText>
        )}

        <View style={styles.metadata}>
          <ThemedText style={styles.metadataText}>
            {new Date(artifact.createdAt).toLocaleDateString()}
          </ThemedText>
          <ThemedText style={styles.metadataText}>
            {artifact.views} views
          </ThemedText>
        </View>

        <InstructionHistorySection history={instructionHistory} />

        <View
          style={[
            styles.contentContainer,
            { backgroundColor: theme.text + '08' },
          ]}
        >
          <MermaidMessageContent
            content={artifact.content}
            textStyle={styles.artifactContent}
          />
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
  contentContainer: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 24,
  },
  artifactContent: {
    fontSize: 16,
  },
});
