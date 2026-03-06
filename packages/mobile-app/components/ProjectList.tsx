import { useState, useMemo } from "react";
import {
  StyleSheet,
  View,
  FlatList,
  SafeAreaView,
  Platform,
  useColorScheme,
  Modal,
  TextInput,
  TouchableOpacity,
  Text,
  KeyboardAvoidingView,
} from "react-native";
import { router } from "expo-router";
import { Colors } from "../constants/Colors";
import { useSelector } from "react-redux";
import { selectProjects, Project } from "../redux/slices/projectsSlice";
import { ProjectListHeader } from "./project-list/ProjectListHeader";
import { ProjectListItem } from "./project-list/ProjectListItem";
import { useProjectActions } from "../hooks/useProjectActions";

export function ProjectList() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const projectsState = useSelector(selectProjects);
  const { handleCreateProject, handleDeleteProject } = useProjectActions();

  const handleViewProject = (projectId: string) => {
    router.push(`/projects/${projectId}` as any);
  };

  // Modal state for creating new project
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Sort projects by updatedAt descending
  const sortedProjects = useMemo(() => {
    return Object.values(projectsState.projects).sort(
      (a, b) => b.updatedAt - a.updatedAt
    );
  }, [projectsState.projects]);

  const handleNewProjectPress = () => {
    setNewProjectName("");
    setShowNewProjectModal(true);
  };

  const handleCreateNewProject = () => {
    const trimmedName = newProjectName.trim();
    if (trimmedName) {
      handleCreateProject(trimmedName);
      setShowNewProjectModal(false);
      setNewProjectName("");
    }
  };

  const handleCancelCreate = () => {
    setShowNewProjectModal(false);
    setNewProjectName("");
  };

  const renderProjectItem = ({ item }: { item: Project }) => (
    <ProjectListItem
      item={item}
      onSelect={handleViewProject}
      onDelete={handleDeleteProject}
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
        <ProjectListHeader onNewProject={handleNewProjectPress} />
        <FlatList
          data={sortedProjects}
          renderItem={renderProjectItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          removeClippedSubviews={true}
          ListEmptyComponent={() => (
            <View style={styles.emptyContainer}>
              <Text style={[styles.emptyText, { color: theme.text + "99" }]}>
                No projects yet. Create one to organize your chats!
              </Text>
            </View>
          )}
        />
      </View>

      {/* New Project Modal */}
      <Modal
        visible={showNewProjectModal}
        transparent
        animationType="fade"
        onRequestClose={handleCancelCreate}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.modalOverlay}
        >
          <View
            style={[
              styles.modalContent,
              { backgroundColor: colorScheme === "dark" ? "#1C1C1E" : "#fff" },
            ]}
          >
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              New Project
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  color: theme.text,
                  backgroundColor: colorScheme === "dark" ? "#2C2C2E" : "#f5f5f5",
                  borderColor: colorScheme === "dark" ? "#3C3C3E" : "#e0e0e0",
                },
              ]}
              placeholder="Project name"
              placeholderTextColor={theme.text + "66"}
              value={newProjectName}
              onChangeText={setNewProjectName}
              autoFocus
              onSubmitEditing={handleCreateNewProject}
              returnKeyType="done"
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.cancelButton,
                  { borderColor: colorScheme === "dark" ? "#3C3C3E" : "#e0e0e0" },
                ]}
                onPress={handleCancelCreate}
              >
                <Text style={[styles.cancelButtonText, { color: theme.text }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.createButton,
                  { backgroundColor: theme.tint },
                  !newProjectName.trim() && styles.disabledButton,
                ]}
                onPress={handleCreateNewProject}
                disabled={!newProjectName.trim()}
              >
                <Text
                  style={[
                    styles.createButtonText,
                    { color: "#fff" },
                  ]}
                >
                  Create
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    width: "85%",
    maxWidth: 400,
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 16,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    borderWidth: 1,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
  createButton: {},
  createButtonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.5,
  },
});
