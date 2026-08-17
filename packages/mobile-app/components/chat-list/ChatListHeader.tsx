import { StyleSheet, View, Text, TextInput, TouchableOpacity, useColorScheme, Platform } from "react-native";
import { Colors } from "../../constants/Colors";

interface ChatListHeaderProps {
  onNewChat: () => void;
  onIncognitoChat: () => void;
  projectName?: string | null;
  onClearProjectFilter?: () => void;
  searchQuery: string;
  onSearchChange: (text: string) => void;
}

const getHeaderColors = (colorScheme: "light" | "dark") => ({
  borderColor: colorScheme === "dark" ? "#262626" : "#EEEEEE",
  badgeBackground: colorScheme === "dark" ? "#262626" : "#F3F4F6",
  badgeBorder: colorScheme === "dark" ? "#333333" : "#E5E7EB",
});

export function ChatListHeader({ onNewChat, onIncognitoChat, projectName, onClearProjectFilter, searchQuery, onSearchChange }: ChatListHeaderProps) {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const headerColors = getHeaderColors(colorScheme);

  return (
    <View
      style={[
        styles.header,
        { borderBottomColor: headerColors.borderColor },
      ]}
    >
      <View style={styles.topRow}>
        <View style={styles.titleContainer}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Chats</Text>
          {projectName && (
            <TouchableOpacity
              style={[
                styles.projectBadge,
                {
                  backgroundColor: headerColors.badgeBackground,
                  borderColor: headerColors.badgeBorder,
                },
              ]}
              onPress={onClearProjectFilter}
            >
              <Text style={[styles.projectBadgeText, { color: theme.tint }]}>
                {projectName}
              </Text>
              <Text style={[styles.clearIcon, { color: theme.icon }]}>×</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={[styles.newChatButton, { backgroundColor: theme.tint }]}
            onPress={onNewChat}
          >
            <Text style={styles.newChatButtonText}>+ New Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.incognitoButton, { borderColor: theme.tint }]}
            onPress={onIncognitoChat}
          >
            <Text style={[styles.incognitoButtonText, { color: theme.tint }]}>🕶️ Incognito</Text>
          </TouchableOpacity>
        </View>
      </View>
      <View style={styles.searchRow}>
        <TextInput
          style={[
            styles.searchInput,
            {
              color: theme.text,
              backgroundColor: headerColors.badgeBackground,
              borderColor: headerColors.badgeBorder,
            },
          ]}
          placeholder="Search chats…"
          placeholderTextColor={theme.icon}
          value={searchQuery}
          onChangeText={onSearchChange}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  topRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  searchRow: {
    marginTop: 10,
  },
  searchInput: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    fontSize: 14,
  },
  titleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 10,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.5,
  },
  projectBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
  },
  projectBadgeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  clearIcon: {
    fontSize: 14,
    fontWeight: "600",
  },
  newChatButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "opacity 0.15s ease",
      } as any,
    }),
  },
  newChatButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#FFFFFF",
    letterSpacing: 0.1,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  incognitoButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1.5,
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "opacity 0.15s ease",
      } as any,
    }),
  },
  incognitoButtonText: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
