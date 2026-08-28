import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, TouchableOpacity, useColorScheme, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { Colors } from '../../constants/Colors';
import { useSystemPrompt, useActiveSystemPrompt } from '../../query-hooks/useChat';
import {
  setCustomSystemPrompt,
  setGeneratingPrompt,
  setPromptError,
  selectCustomSystemPrompt,
  selectIsGeneratingPrompt,
  selectPromptError,
  selectPromptLastGenerated
} from '../../redux/slices/userSettingsSlice';

// Component for managing system prompts in settings.
//
// Two distinct surfaces:
//  1. "Current System Prompt" — the ACTIVE dynamic prompt the assistant is
//     actually using right now (v2 seed + rendered covenant + persona +
//     behavior sections + personal data). Read-only; fetched from the backend.
//  2. "System Prompt Generator" — the existing one-off custom prompt generator
//     (retained). Its output is shown read-only below the button.
const SystemPromptSettings = () => {
  const dispatch = useDispatch();
  const colorScheme = useColorScheme();
  const { generateSystemPrompt } = useSystemPrompt();
  const {
    activePrompt,
    fetchActivePrompt,
    isLoading: isLoadingActive,
    error: activeError,
  } = useActiveSystemPrompt();

  const customSystemPrompt = useSelector(selectCustomSystemPrompt);
  const isGenerating = useSelector(selectIsGeneratingPrompt);
  const error = useSelector(selectPromptError);
  const lastGenerated = useSelector(selectPromptLastGenerated);

  const theme = Colors[colorScheme ?? 'light'];

  // Fetch the active prompt once on mount so the read-only display reflects
  // the current dynamic prompt without requiring the user to tap anything.
  useEffect(() => {
    fetchActivePrompt().catch(() => {});
  }, [fetchActivePrompt]);

  const handleRefreshActivePrompt = useCallback(async () => {
    try {
      await fetchActivePrompt();
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to fetch active system prompt');
    }
  }, [fetchActivePrompt]);

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
      {/* ── Active dynamic prompt (read-only) ──────────────────── */}
      <View style={styles.section}>
        <Text style={[styles.title, { color: theme.text }]}>Current System Prompt</Text>
        <Text style={[styles.description, { color: theme.icon }]}>
          The live prompt the assistant is using right now. It evolves as your
          conversation deepens.
        </Text>
      </View>

      <View style={styles.section}>
        <TouchableOpacity
          style={[
            styles.generateButton,
            {
              backgroundColor: isLoadingActive ? theme.icon : theme.tint,
              opacity: isLoadingActive ? 0.6 : 1,
            },
          ]}
          onPress={handleRefreshActivePrompt}
          disabled={isLoadingActive}
        >
          <Text style={[styles.generateButtonText, { color: '#FFFFFF' }]}>
            {isLoadingActive ? 'Loading...' : 'Refresh System Prompt'}
          </Text>
        </TouchableOpacity>
      </View>

      {activeError && (
        <View style={styles.section}>
          <Text style={[styles.errorText, { color: '#FF6B6B' }]}>
            Error: {activeError.message}
          </Text>
        </View>
      )}

      <View style={styles.section}>
        <ScrollView
          style={[styles.promptContainer, { borderColor: theme.icon }]}
          nestedScrollEnabled
        >
          {activePrompt ? (
            <Text style={[styles.promptText, { color: theme.text }]} selectable>
              {activePrompt}
            </Text>
          ) : (
            <View style={styles.loadingRow}>
              <ActivityIndicator color={theme.icon} />
              <Text style={[styles.helpText, { color: theme.icon }]}>
                {isLoadingActive ? 'Loading active prompt...' : 'No active prompt loaded.'}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* ── Custom prompt generator (retained) ─────────────────── */}
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
              opacity: isGenerating ? 0.6 : 1,
            },
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
          <Text style={[styles.label, { color: theme.text }]}>Generated Custom Prompt</Text>
          <ScrollView style={[styles.promptContainer, { borderColor: theme.icon }]} nestedScrollEnabled>
            <Text style={[styles.promptText, { color: theme.text }]} selectable>
              {customSystemPrompt}
            </Text>
          </ScrollView>
          <Text style={[styles.helpText, { color: theme.icon }]}>
            Start a message with /custom to use this prompt instead of the active one.
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
    maxHeight: 400,
  },
  promptText: {
    padding: 12,
    fontSize: 14,
    lineHeight: 20,
    minHeight: 200,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
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
