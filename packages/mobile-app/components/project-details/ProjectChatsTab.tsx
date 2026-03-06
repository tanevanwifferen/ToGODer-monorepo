import React, { useMemo } from "react";
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  Alert,
  Platform,
  useColorScheme,
} from "react-native";
import { router } from "expo-router";
import { useSelector, useDispatch } from "react-redux";
import { v4 as uuidv4 } from "uuid";
import { Colors } from "../../constants/Colors";
import { RootState } from "../../redux/store";
import { addChat, deleteChat, setCurrentChat } from "../../redux/slices/chatsSlice";
import { addChatToProject } from "../../redux/slices/projectsSlice";
import { ChatListItem } from "../chat-list/ChatListItem";
import { IconSymbol } from "../ui/IconSymbol";

const getProjectColors = (colorScheme: "light" | "dark") => ({
  emptyText: colorScheme === "dark" ? "#6B7280" : "#9CA3AF",
});

interface ProjectChatsTabProps {
  projectId: string;
}

export function ProjectChatsTab({ projectId }: ProjectChatsTabProps) {
  const dispatch = useDispatch();
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const projectColors = getProjectColors(colorScheme);

  const chats = useSelector((state: RootState) => state.chats.chats);

  // Filter chats that belong to this project
  const projectChats = useMemo(() => {
    return Object.values(chats)
      .filter((chat) => chat.projectId === projectId && !chat.isRequest)
      .sort((a, b) => (b.last_update ?? 0) - (a.last_update ?? 0));
  }, [chats, projectId]);

  const handleSelectChat = (chatId: string) => {
    dispatch(setCurrentChat(chatId));
    router.push({ pathname: '/chat/[id]', params: { id: chatId } });
  };

  const handleDeleteChat = (chatId: string, title: string | null | undefined) => {
    const confirmDelete = () => {
      dispatch(deleteChat(chatId));
    };

    if (Platform.OS === "web") {
      if (confirm(`Delete "${title || "Untitled Chat"}"?`)) {
        confirmDelete();
      }
    } else {
      Alert.alert(
        "Delete Chat",
        `Delete "${title || "Untitled Chat"}"?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: confirmDelete },
        ]
      );
    }
  };

  const handleNewChat = () => {
    const chatId = uuidv4();
    dispatch(
      addChat({
        id: chatId,
        messages: [],
        memories: [],
        projectId,
      })
    );
    dispatch(addChatToProject({ projectId, chatId }));
    dispatch(setCurrentChat(chatId));
    router.push({ pathname: '/chat/[id]', params: { id: chatId } });
  };

  const renderItem = ({ item }: { item: (typeof projectChats)[0] }) => (
    <ChatListItem
      item={item}
      onSelect={handleSelectChat}
      onDelete={handleDeleteChat}
    />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={[styles.emptyText, { color: projectColors.emptyText }]}>
        No chats in this project yet
      </Text>
      <TouchableOpacity
        style={[styles.newChatButton, { backgroundColor: theme.tint }]}
        onPress={handleNewChat}
      >
        <IconSymbol name="plus" size={14} color="white" />
        <Text style={styles.newChatButtonText}>Start a Chat</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: theme.tint + "20" }]}
          onPress={handleNewChat}
        >
          <IconSymbol name="plus" size={16} color={theme.tint} />
          <Text style={[styles.addButtonText, { color: theme.tint }]}>New Chat</Text>
        </TouchableOpacity>
      </View>
      <FlatList
        data={projectChats}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListEmptyComponent={renderEmpty}
        contentContainerStyle={projectChats.length === 0 && styles.emptyList}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    gap: 6,
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "opacity 0.15s ease",
      } as any,
    }),
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: "600",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 14,
    marginBottom: 16,
    letterSpacing: -0.1,
  },
  emptyList: {
    flex: 1,
  },
  newChatButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 8,
    ...Platform.select({
      web: {
        cursor: "pointer",
        transition: "opacity 0.15s ease",
      } as any,
    }),
  },
  newChatButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
    letterSpacing: 0.1,
  },
});
