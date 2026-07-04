import React from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { ThemedText } from "../ThemedText";

interface ToolActivityIndicatorProps {
  /** Human-readable description of what the AI is doing, or null to hide */
  activity: string | null;
}

/**
 * Small inline indicator shown at the bottom of the message list while the
 * AI is using a tool (e.g. "Searching the library…", "Writing an artifact…").
 */
export function ToolActivityIndicator({ activity }: ToolActivityIndicatorProps) {
  if (!activity) {
    return null;
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="small" />
      <ThemedText style={styles.text}>{activity}…</ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    marginLeft: 8,
    fontSize: 14,
    fontStyle: "italic",
    opacity: 0.7,
  },
});
