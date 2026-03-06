import React, { useState } from 'react';
import { View, StyleSheet, Text, TextInput, TouchableOpacity, useColorScheme, ScrollView, Alert } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { Colors } from '../../constants/Colors';
import { useSystemPrompt } from '../../query-hooks/useChat';
import {
  setCustomSystemPrompt,
  setGeneratingPrompt,
  setPromptError,
  selectCustomSystemPrompt,
  selectIsGeneratingPrompt,
  selectPromptError,
  selectPromptLastGenerated
} from '../../redux/slices/userSettingsSlice';

// Component for managing custom system prompts in settings
// Allows users to generate and view personalized system prompts using the useSystemPrompt hook
const SystemPromptSettings = () => {
  const dispatch = useDispatch();
  const colorScheme = useColorScheme();
  const { generateSystemPrompt } = useSystemPrompt();

  const customSystemPrompt = useSelector(selectCustomSystemPrompt);
  const isGenerating = useSelector(selectIsGeneratingPrompt);
  const error = useSelector(selectPromptError);
  const lastGenerated = useSelector(selectPromptLastGenerated);

  const theme = Colors[colorScheme ?? 'light'];

  const handleGenerateSystemPrompt = async () => {
    try {
      dispatch(setGeneratingPrompt(true));
      const generatedPrompt = await generateSystemPrompt();
      dispatch(setCustomSystemPrompt(generatedPrompt));
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate system prompt';
      dispatch(setPromptError(errorMessage));
      Alert.alert('Error', errorMessage);
    } finally {
      dispatch(setGeneratingPrompt(false));
    }
  };

  const formatLastGenerated = (timestamp: string | null) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.section}>
        <Text style={[styles.title, { color: theme.text }]}>System Prompt Generator</Text>
        <Text style={[styles.description, { color: theme.icon }]}>
          Generate a personalized system prompt based on your data and preferences.
        </Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[
            styles.generateButton,
            { 
              backgroundColor: isGenerating ? theme.icon : theme.tint,
              opacity: isGenerating ? 0.6 : 1
            }
          ]}
          onPress={handleGenerateSystemPrompt}
          disabled={isGenerating}
        >
          <Text style={[styles.generateButtonText, { color: '#FFFFFF' }]}>
            {isGenerating ? 'Generating...' : 'Generate System Prompt'}
          </Text>
        </TouchableOpacity>
      </View>

      {lastGenerated && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>
            Last Generated: {formatLastGenerated(lastGenerated)}
          </Text>
        </View>
      )}

      {error && (
        <View style={styles.section}>
          <Text style={[styles.errorText, { color: '#FF6B6B' }]}>
            Error: {error}
          </Text>
        </View>
      )}

      {customSystemPrompt && (
        <View style={styles.section}>
          <Text style={[styles.label, { color: theme.text }]}>Generated System Prompt</Text>
          <ScrollView style={[styles.promptContainer, { borderColor: theme.icon }]}>
            <TextInput
              style={[styles.promptText, { color: theme.text }]}
              value={customSystemPrompt}
              onChangeText={(text) => dispatch(setCustomSystemPrompt(text))}
              multiline
              placeholder="Your generated system prompt will appear here..."
              placeholderTextColor={theme.icon}
              textAlignVertical="top"
            />
          </ScrollView>
          <Text style={[styles.helpText, { color: theme.icon }]}>
            You can edit the generated prompt above if needed.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 24,
    minHeight: 400,
  },
  section: {
    marginBottom: 24,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  generateButton: {
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  generateButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  promptContainer: {
    borderWidth: 1,
    borderRadius: 8,
    minHeight: 200,
    maxHeight: 300,
  },
  promptText: {
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 200,
  },
  helpText: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  errorText: {
    fontSize: 14,
    fontWeight: '500',
  },
});

export default SystemPromptSettings;