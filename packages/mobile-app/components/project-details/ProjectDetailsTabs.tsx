import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  useColorScheme,
  Platform,
} from "react-native";
import { Colors } from "../../constants/Colors";

export type TabType = "chats" | "artifacts";

interface ProjectDetailsTabsProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  chatCount: number;
  artifactCount: number;
}

const getTabColors = (colorScheme: "light" | "dark") => ({
  containerBackground: colorScheme === "dark" ? "#1E1E1E" : "#F3F4F6",
  containerBorder: colorScheme === "dark" ? "#2A2A2A" : "#E5E7EB",
  inactiveText: colorScheme === "dark" ? "#9CA3AF" : "#6B7280",
});

export function ProjectDetailsTabs({
  activeTab,
  onTabChange,
  chatCount,
  artifactCount,
}: ProjectDetailsTabsProps) {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const tabColors = getTabColors(colorScheme);

  const tabs: { key: TabType; label: string; count: number }[] = [
    { key: "chats", label: "Chats", count: chatCount },
    { key: "artifacts", label: "Artifacts", count: artifactCount },
  ];

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: tabColors.containerBackground,
          borderColor: tabColors.containerBorder,
        },
      ]}
    >
      {tabs.map((tab) => (
        <TouchableOpacity
          key={tab.key}
          style={[
            styles.tab,
            activeTab === tab.key && [
              styles.activeTab,
              { backgroundColor: theme.tint },
            ],
          ]}
          onPress={() => onTabChange(tab.key)}
        >
          <Text
            style={[
              styles.tabText,
              {
                color: activeTab === tab.key ? "#FFFFFF" : tabColors.inactiveText,
              },
            ]}
          >
            {tab.label}
          </Text>
          <View
            style={[
              styles.badge,
              {
                backgroundColor:
                  activeTab === tab.key ? "rgba(255,255,255,0.25)" : theme.tint + "18",
              },
            ]}
          >
            <Text
              style={[
                styles.badgeText,
                { color: activeTab === tab.key ? "#FFFFFF" : theme.tint },
              ]}
            >
              {tab.count}
            </Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
    borderWidth: 1,
  },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 7,
    gap: 8,
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "all 0.15s ease",
      } as any,
    }),
  },
  activeTab: {
    // backgroundColor set dynamically
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: -0.1,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    minWidth: 22,
    alignItems: "center",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});
