/**
 * Collapsible section showing the server-signed history of custom
 * instructions that were active while a shared chat/artifact was created.
 * Each entry carries a server timestamp signed together with the content,
 * so the moments the instructions changed are verifiable.
 */

import React, { useState } from 'react';
import { StyleSheet, View, TouchableOpacity } from 'react-native';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Colors } from '../../constants/Colors';
import { ThemedText } from '../ThemedText';
import { SignedInstructionSnapshot } from '../../model/ShareTypes';

interface InstructionHistorySectionProps {
  history: SignedInstructionSnapshot[];
}

export function InstructionHistorySection({
  history,
}: InstructionHistorySectionProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const [expanded, setExpanded] = useState(false);

  if (history.length === 0) return null;

  const sorted = [...history].sort((a, b) => a.timestamp - b.timestamp);

  return (
    <View style={[styles.container, { borderColor: theme.text + '20' }]}>
      <TouchableOpacity
        style={styles.headerRow}
        onPress={() => setExpanded(!expanded)}
      >
        <ThemedText style={styles.headerTitle}>
          Custom instructions ({sorted.length}{' '}
          {sorted.length === 1 ? 'version' : 'versions'})
        </ThemedText>
        <ThemedText style={styles.chevron}>{expanded ? '▲' : '▼'}</ThemedText>
      </TouchableOpacity>

      {expanded && (
        <View style={styles.entries}>
          {sorted.map((entry, index) => (
            <View
              key={`${entry.timestamp}-${index}`}
              style={[
                styles.entry,
                { backgroundColor: theme.text + '08' },
              ]}
            >
              <View style={styles.entryHeader}>
                <ThemedText style={styles.entryLabel}>
                  {index === 0 ? 'Initial version' : `Changed`}
                </ThemedText>
                <ThemedText style={styles.entryTimestamp}>
                  {new Date(entry.timestamp).toLocaleString()}
                </ThemedText>
              </View>
              <ThemedText style={styles.entryContent}>
                {entry.content}
              </ThemedText>
              <ThemedText style={styles.signatureNote}>
                ✓ Signed by server
              </ThemedText>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 16,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  chevron: {
    fontSize: 12,
    opacity: 0.7,
  },
  entries: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    gap: 8,
  },
  entry: {
    borderRadius: 8,
    padding: 12,
  },
  entryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  entryLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    opacity: 0.8,
  },
  entryTimestamp: {
    fontSize: 12,
    opacity: 0.7,
  },
  entryContent: {
    fontSize: 14,
  },
  signatureNote: {
    fontSize: 11,
    opacity: 0.6,
    marginTop: 8,
  },
});
