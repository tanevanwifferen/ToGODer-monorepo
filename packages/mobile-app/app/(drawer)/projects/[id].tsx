import React, { useLayoutEffect, useState, useMemo, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Platform,
  SafeAreaView,
  useColorScheme,
} from "react-native";
import { router, useNavigation, useLocalSearchParams } from "expo-router";
import { useSelector, useDispatch } from "react-redux";
import { Colors } from "../../../constants/Colors";
import { RootState } from "../../../redux/store";
import { updateProject } from "../../../redux/slices/projectsSlice";
import { selectProjectArtifacts } from "../../../redux/slices/artifactsSlice";
import {
  ProjectDetailsTabs,
  ProjectChatsTab,
  ProjectArtifactsTab,
  TabType,
} from "../../../components/project-details";
import { useProjectActions } from "../../../hooks/useProjectActions";

export default function ProjectDetailsScreen() {
  const { id } = useLocalSearchParams();
  const projectId = id as string;
  const dispatch = useDispatch();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const navigation = useNavigation();
  const { handleRenameProject } = useProjectActions();

  const project = useSelector(
    (state: RootState) => state.projects.projects[projectId]
  );
  const chats = useSelector((state: RootState) => state.chats.chats);
  const artifacts = useSelector((state: RootState) =>
    selectProjectArtifacts(state, projectId)
  );

  const [activeTab, setActiveTab] = useState<TabType>("chats");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState(project?.name || "");
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [description, setDescription] = useState(project?.description || "");

  // Sync editedName when project changes
  useEffect(() => {
    if (project?.name) {
      setEditedName(project.name);
    }
  }, [project?.name]);

  // Count chats belonging to this project
  const chatCount = useMemo(() => {
    return Object.values(chats).filter(
      (chat) => chat.projectId === projectId && !chat.isRequest
    ).length;
  }, [chats, projectId]);

  // Update navigation title
  useLayoutEffect(() => {
    if (project?.name) {
      navigation.setOptions({
        title: project.name,
      });
    }
  }, [navigation, project?.name]);

  if (!project) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <View style={styles.notFound}>
          <Text style={[styles.notFoundText, { color: theme.text }]}>
            Project not found
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: theme.primary }]}
            onPress={() => router.back()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleSaveName = () => {
    if (editedName.trim()) {
      handleRenameProject(projectId, editedName.trim());
      navigation.setOptions({ title: editedName.trim() });
    }
    setIsEditingName(false);
  };

  const handleSaveDescription = () => {
    dispatch(
      updateProject({
        id: projectId,
        updates: { description },
      })
    );
    setIsEditingDescription(false);
  };

  const containerStyle =
    Platform.OS === "web" ? styles.webContainer : styles.container;
  const contentStyle = Platform.OS === "web" ? styles.webContent : styles.content;

  return (
    <SafeAreaView
      style={[containerStyle, { backgroundColor: theme.background }]}
    >
      <View style={contentStyle}>
        {/* Project Info Header */}
        <View style={styles.header}>
          {/* Name Section */}
          <View style={styles.nameSection}>
            {isEditingName ? (
              <View style={styles.editNameContainer}>
                <TextInput
                  style={[
                    styles.nameInput,
                    {
                      color: theme.text,
                      backgroundColor:
                        colorScheme === "dark" ? "#2D2D2D" : "#f5f5f5",
                      borderColor: theme.tint,
                    },
                  ]}
                  value={editedName}
                  onChangeText={setEditedName}
                  placeholder="Project name"
                  placeholderTextColor={theme.text + "66"}
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => {
                      setEditedName(project?.name || "");
                      setIsEditingName(false);
                    }}
                  >
                    <Text
                      style={[styles.editButtonText, { color: theme.text + "99" }]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editButton, { backgroundColor: theme.primary }]}
                    onPress={handleSaveName}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setIsEditingName(true)}>
                <Text style={[styles.projectName, { color: theme.text }]}>
                  {project.name}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Description Section */}
          <View style={styles.descriptionSection}>
            {isEditingDescription ? (
              <View style={styles.editDescriptionContainer}>
                <TextInput
                  style={[
                    styles.descriptionInput,
                    {
                      color: theme.text,
                      backgroundColor:
                        colorScheme === "dark" ? "#2D2D2D" : "#f5f5f5",
                      borderColor: theme.tint,
                    },
                  ]}
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Add a description..."
                  placeholderTextColor={theme.text + "66"}
                  multiline
                  autoFocus
                />
                <View style={styles.editActions}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => {
                      setDescription(project?.description || "");
                      setIsEditingDescription(false);
                    }}
                  >
                    <Text
                      style={[styles.editButtonText, { color: theme.text + "99" }]}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.editButton, { backgroundColor: theme.primary }]}
                    onPress={handleSaveDescription}
                  >
                    <Text style={styles.saveButtonText}>Save</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setIsEditingDescription(true)}>
                <Text
                  style={[
                    styles.description,
                    {
                      color: project.description ? theme.text : theme.text + "66",
                    },
                  ]}
                  numberOfLines={2}
                >
                  {project.description || "Tap to add a description..."}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statValue, { color: theme.tint }]}>
                {new Date(project.createdAt).toLocaleDateString()}
              </Text>
              <Text style={[styles.statLabel, { color: theme.text + "99" }]}>
                Created
              </Text>
            </View>
          </View>
        </View>

        {/* Tabs */}
        <ProjectDetailsTabs
          activeTab={activeTab}
          onTabChange={setActiveTab}
          chatCount={chatCount}
          artifactCount={artifacts.length}
        />

        {/* Tab Content */}
        <View style={styles.tabContent}>
          {activeTab === "chats" ? (
            <ProjectChatsTab projectId={projectId} />
          ) : (
            <ProjectArtifactsTab projectId={projectId} />
          )}
        </View>
      </View>
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
  content: {
    flex: 1,
    padding: 16,
  },
  webContent: {
    width: "100%",
    maxWidth: 600,
    flex: 1,
    padding: 16,
  },
  notFound: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  notFoundText: {
    fontSize: 18,
    marginBottom: 16,
  },
  backButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  backButtonText: {
    color: "white",
    fontWeight: "600",
  },
  header: {
    marginBottom: 16,
  },
  nameSection: {
    marginBottom: 12,
  },
  projectName: {
    fontSize: 20,
    fontWeight: "600",
    lineHeight: 28,
  },
  editNameContainer: {
    gap: 12,
  },
  nameInput: {
    fontSize: 20,
    fontWeight: "600",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  descriptionSection: {
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
  },
  editDescriptionContainer: {
    gap: 12,
  },
  descriptionInput: {
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    minHeight: 60,
    textAlignVertical: "top",
  },
  editActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
  editButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  editButtonText: {
    fontSize: 14,
    fontWeight: "500",
  },
  saveButtonText: {
    color: "white",
    fontSize: 14,
    fontWeight: "500",
  },
  statsRow: {
    flexDirection: "row",
    gap: 24,
  },
  statItem: {
    alignItems: "center",
  },
  statValue: {
    fontSize: 14,
    fontWeight: "600",
  },
  statLabel: {
    fontSize: 11,
    marginTop: 2,
  },
  tabContent: {
    flex: 1,
  },
});
