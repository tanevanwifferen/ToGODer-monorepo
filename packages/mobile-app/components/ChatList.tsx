import React, { useState, useCallback } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  SafeAreaView,
  Platform,
  useColorScheme,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { Colors } from "../constants/Colors";
import { Chat } from "../redux/slices/chatsSlice";
import { selectProjects, setCurrentProject } from "../redux/slices/projectsSlice";
import { ChatListHeader } from "./chat-list/ChatListHeader";
import { ChatListItem } from "./chat-list/ChatListItem";
import { ChatSectionHeader } from "./chat-list/ChatSectionHeader";
import { ProjectAssignmentModal } from "./chat-list/ProjectAssignmentModal";
import { useChatListActions } from "../hooks/useChatListActions";
import { useSortedChats } from "../hooks/useSortedChats";
import { useChatProjectAssignment } from "../hooks/useChatProjectAssignment";

export function ChatList() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const dispatch = useDispatch();
  const { handleCreateNewChat, handleDeleteChat, handleSelectChat } = useChatListActions();
  const { sortedChatRequests, sortedChats, hasRequests, chatsMap, currentProjectId } = useSortedChats();
  const { assignChatToProject, getProjectNameForChat, handleCreateProject } = useChatProjectAssignment();
  const projectsState = useSelector(selectProjects);

  // Get current project name for header display
  const currentProjectName = currentProjectId
    ? projectsState.projects[currentProjectId]?.name
    : null;

  const handleClearProjectFilter = useCallback(() => {
    dispatch(setCurrentProject(null));
  }, [dispatch]);

  const [assignmentModalVisible, setAssignmentModalVisible] = useState(false);
  const [selectedChatForAssignment, setSelectedChatForAssignment] = useState<Chat | null>(null);

  const handleOpenAssignmentModal = useCallback((chatId: string) => {
    const chat = chatsMap[chatId];
    if (chat) {
      setSelectedChatForAssignment(chat);
      setAssignmentModalVisible(true);
    }
  }, [chatsMap]);

  const handleCloseAssignmentModal = useCallback(() => {
    setAssignmentModalVisible(false);
    setSelectedChatForAssignment(null);
  }, []);

  const handleAssignProject = useCallback((projectId: string | undefined) => {
    if (selectedChatForAssignment) {
      assignChatToProject(
        selectedChatForAssignment.id,
        projectId,
        selectedChatForAssignment.projectId
      );
    }
  }, [selectedChatForAssignment, assignChatToProject]);

  const renderChatItem = ({
    item,
    isRequest,
  }: {
    item: Chat;
    isRequest?: boolean;
  }) => (
    <ChatListItem
      item={item}
      isRequest={isRequest}
      onSelect={handleSelectChat}
      onDelete={handleDeleteChat}
      onLongPress={handleOpenAssignmentModal}
      projectName={getProjectNameForChat(item.projectId)}
    />
  );

  const containerStyle =
    Platform.OS === "web" ? styles.webContainer : styles.container;
  const contentStyle = Platform.OS === "web" ? styles.webContent : undefined;

  return (
    <SafeAreaView
      style={[containerStyle, { backgroundColor: theme.background }]}
    >
      <View style={[contentStyle]}>
        <ChatListHeader
          onNewChat={handleCreateNewChat}
          projectName={currentProjectName}
          onClearProjectFilter={handleClearProjectFilter}
        />
        <FlatList
          data={[...sortedChatRequests, ...sortedChats]}
          renderItem={({ item, index }) =>
            renderChatItem({
              item,
              isRequest: index < sortedChatRequests.length,
            })
          }
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          ListHeaderComponent={() =>
            hasRequests ? <ChatSectionHeader title="Requests" /> : null
          }
        />
      </View>
      <ProjectAssignmentModal
        visible={assignmentModalVisible}
        onClose={handleCloseAssignmentModal}
        onAssign={handleAssignProject}
        onCreateProject={handleCreateProject}
        currentProjectId={selectedChatForAssignment?.projectId}
        chatTitle={selectedChatForAssignment?.title}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webContainer: {
    flex: 1,
    alignItems: "center",
  },
  webContent: {
    width: "100%",
    maxWidth: 600,
    flex: 1,
  },
  listContent: {
    padding: 16,
  },
});
