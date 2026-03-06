import React from 'react';
import { StyleSheet, ScrollView, TouchableOpacity, Text, View, useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import CustomCheckbox from '../ui/CustomCheckbox';

interface PromptSuggestionsProps {
  prompts: [string, { description: string }][];
  showPrompts: boolean;
  libraryIntegrationEnabled: boolean;
  onToggleLibraryIntegration: (value: boolean) => void;
  onSelectPrompt: (key: string) => void;
}

export function PromptSuggestions({
  prompts,
  showPrompts,
  libraryIntegrationEnabled,
  onToggleLibraryIntegration,
  onSelectPrompt
}: PromptSuggestionsProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          borderColor: colorScheme === 'dark' ? '#2D2D2D' : '#e0e0e0'
        }
      ]}
    >
      <View style={styles.toggleRow}>
        <CustomCheckbox
          value={libraryIntegrationEnabled}
          onValueChange={onToggleLibraryIntegration}
          color={theme.tint}
          colorScheme={colorScheme}
        />
        <Text style={[styles.toggleLabel, { color: theme.text }]}>
          Library Integration
        </Text>
      </View>

      {showPrompts && prompts.length > 0 && (
        <ScrollView style={styles.promptsList}>
          {prompts.map(([key, prompt], index) => (
            <TouchableOpacity
              key={key}
              style={[
                styles.promptItem,
                index !== prompts.length - 1 && {
                  borderBottomColor: colorScheme === 'dark' ? '#2D2D2D' : '#e0e0e0'
                },
                index === prompts.length - 1 && { borderBottomWidth: 0 }
              ]}
              onPress={() => onSelectPrompt(key)}
            >
              <Text style={[styles.promptKey, { color: theme.text }]}>{key}</Text>
              <Text
                style={[
                  styles.promptDesc,
                  { color: colorScheme === 'dark' ? '#9BA1A6' : '#666' }
                ]}
                numberOfLines={6}
              >
                {prompt.description.replace(/\s+/g, ' ')}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 4,
    marginHorizontal: 8,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  toggleLabel: {
    marginLeft: 12,
    fontSize: 14,
    fontWeight: '500',
  },
  promptsList: {
    maxHeight: 200,
    marginTop: 12,
  },
  promptItem: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  promptKey: {
    fontWeight: 'bold',
    marginRight: 8,
    minWidth: 80,
  },
  promptDesc: {
    flex: 1,
  },
});
