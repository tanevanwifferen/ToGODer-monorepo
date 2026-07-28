import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from "react-native";
import {
  getConsoleErrors,
  clearConsoleErrors,
  getConsoleErrorSummary,
  ConsoleErrorEntry,
} from "../../services/ConsoleErrorService";
import { Colors } from "../../constants/Colors";
import { useFocusEffect } from "expo-router";

const LEVEL_COLORS: Record<string, string> = {
  error: "#dc2626",
  warn: "#d97706",
  log: "#6b7280",
};

export default function ConsoleErrorSettings() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const isDark = colorScheme === "dark";

  const [entries, setEntries] = useState<ConsoleErrorEntry[]>([]);
  const [summary, setSummary] = useState(getConsoleErrorSummary());
  const [expanded, setExpanded] = useState(false);

  // Refresh on focus so new errors show up
  useFocusEffect(
    useCallback(() => {
      setEntries(getConsoleErrors());
      setSummary(getConsoleErrorSummary());
    }, []),
  );

  const handleClear = () => {
    clearConsoleErrors();
    setEntries([]);
    setSummary({ error: 0, warn: 0, log: 0 });
  };

  const handleRefresh = () => {
    setEntries(getConsoleErrors());
    setSummary(getConsoleErrorSummary());
  };

  const bgColor = isDark ? "#1c1c1e" : "#f5f5f5";
  const cardBg = isDark ? "#2c2c2e" : "#ffffff";
  const textColor = isDark ? "#ffffff" : "#000000";
  const mutedColor = isDark ? "#8e8e93" : "#6b7280";
  const borderColor = isDark ? "#38383a" : "#e5e5e5";

  const total = summary.error + summary.warn + summary.log;

  return (
    <View style={[styles.container, { backgroundColor: cardBg }]}>
      {/* Header row */}
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: textColor }]}>
            Console Errors
          </Text>
          <Text style={[styles.subtitle, { color: mutedColor }]}>
            {total > 0
              ? `${summary.error} error${summary.error !== 1 ? "s" : ""}, ${summary.warn} warning${summary.warn !== 1 ? "s" : ""}, ${summary.log} log${summary.log !== 1 ? "s" : ""}`
              : "No errors captured"}
          </Text>
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity onPress={handleRefresh} style={styles.button}>
            <Text style={[styles.buttonText, { color: colors.tint }]}>
              Refresh
            </Text>
          </TouchableOpacity>
          {total > 0 && (
            <TouchableOpacity onPress={handleClear} style={styles.button}>
              <Text style={[styles.buttonText, { color: "#dc2626" }]}>
                Clear
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Summary bars */}
      {total > 0 && (
        <View style={styles.summaryBars}>
          <View
            style={[
              styles.bar,
              {
                flex: summary.error,
                backgroundColor: LEVEL_COLORS.error,
              },
            ]}
          />
          <View
            style={[
              styles.bar,
              {
                flex: summary.warn,
                backgroundColor: LEVEL_COLORS.warn,
              },
            ]}
          />
          <View
            style={[
              styles.bar,
              {
                flex: summary.log,
                backgroundColor: LEVEL_COLORS.log,
              },
            ]}
          />
          {total === 0 && <View style={[styles.bar, { flex: 1, backgroundColor: borderColor }]} />}
        </View>
      )}

      {/* Entry list */}
      {entries.length > 0 && (
        <>
          <TouchableOpacity
            onPress={() => setExpanded(!expanded)}
            style={[styles.expandButton, { borderColor }]}
          >
            <Text style={[styles.expandText, { color: colors.tint }]}>
              {expanded ? "Collapse" : `Show ${entries.length} entr${entries.length !== 1 ? "ies" : "y"}`}
            </Text>
          </TouchableOpacity>

          {expanded && (
            <ScrollView
              style={[styles.entryList, { backgroundColor: bgColor }]}
              nestedScrollEnabled
            >
              {entries.map((entry, i) => (
                <View
                  key={i}
                  style={[styles.entry, { borderBottomColor: borderColor }]}
                >
                  <View style={styles.entryHeader}>
                    <View
                      style={[
                        styles.levelBadge,
                        { backgroundColor: LEVEL_COLORS[entry.level] + "22" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.levelText,
                          { color: LEVEL_COLORS[entry.level] },
                        ]}
                      >
                        {entry.level.toUpperCase()}
                      </Text>
                    </View>
                    <Text style={[styles.timestamp, { color: mutedColor }]}>
                      {entry.timestamp.slice(11, 19)}
                    </Text>
                  </View>
                  <Text
                    style={[styles.message, { color: textColor }]}
                    numberOfLines={5}
                  >
                    {entry.message}
                  </Text>
                  {entry.stack && (
                    <Text
                      style={[styles.stack, { color: mutedColor }]}
                      numberOfLines={3}
                    >
                      {entry.stack}
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          )}
        </>
      )}

      {total === 0 && (
        <Text style={[styles.empty, { color: mutedColor }]}>
          Intercepted console.error, console.warn, and console.log calls will
          appear here. This panel helps debug client-side issues.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  headerButtons: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  summaryBars: {
    flexDirection: "row",
    height: 4,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 2,
    overflow: "hidden",
  },
  bar: {
    minWidth: 4,
  },
  expandButton: {
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
    alignItems: "center",
  },
  expandText: {
    fontSize: 14,
    fontWeight: "500",
  },
  entryList: {
    maxHeight: 400,
    paddingHorizontal: 16,
  },
  entry: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  entryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  levelBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  levelText: {
    fontSize: 10,
    fontWeight: "700",
  },
  timestamp: {
    fontSize: 11,
  },
  message: {
    fontSize: 13,
    fontFamily: "SpaceMono",
  },
  stack: {
    fontSize: 11,
    fontFamily: "SpaceMono",
    marginTop: 4,
  },
  empty: {
    fontSize: 13,
    padding: 16,
    paddingTop: 0,
    lineHeight: 18,
  },
});
