/**
 * Modal component for assigning a chat to a project.
 * Allows users to select an existing project or create a new one.
 */

import React, { useState, useEffect } from "react";
import {
  Modal,
  StyleSheet,
  View,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { useSelector } from "react-redux";
import { useColorScheme } from "../../hooks/useColorScheme";
import { Colors } from "../../constants/Colors";
import { ThemedText } from "../ThemedText";
import { selectProjects, Project } from "../../redux/slices/projectsSlice";

interface ProjectAssignmentModalProps {
  visible: boolean;
  onClose: () => void;
  onAssign: (projectId: string | undefined) => void;
  onCreateProject: (name: string) => string;
  currentProjectId?: string;
  chatTitle?: string | null;
}

export function ProjectAssignmentModal({
  visible,
  onClose,
  onAssign,
  onCreateProject,
  currentProjectId,
  chatTitle,
}: ProjectAssignmentModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const projectsState = useSelector(selectProjects);
  const projects = Object.values(projectsState.projects);

  const [selectedProjectId, setSelectedProjectId] = useState<string | undefined>(
    currentProjectId
  );
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  useEffect(() => {
    if (visible) {
      setSelectedProjectId(currentProjectId);
      setIsCreatingNew(false);
      setNewProjectName("");
    }
  }, [visible, currentProjectId]);

  const handleSave = () => {
    if (isCreatingNew && newProjectName.trim()) {
      const newId = onCreateProject(newProjectName.trim());
      onAssign(newId);
    } else {
      onAssign(selectedProjectId);
    }
    onClose();
  };

  const handleSelectProject = (projectId: string | undefined) => {
    setSelectedProjectId(projectId);
    setIsCreatingNew(false);
  };

  const handleCreateNew = () => {
    setIsCreatingNew(true);
    setSelectedProjectId(undefined);
  };

  const isButtonDisabled = isCreatingNew && !newProjectName.trim();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.modalContainer}
      >
        <View
          style={[styles.modalContent, { backgroundColor: theme.background }]}
        >
          <ThemedText style={styles.modalTitle}>Assign to Project</ThemedText>
          {chatTitle && (
            <ThemedText
              style={[styles.chatTitlePreview, { color: theme.text + "99" }]}
              numberOfLines={1}
            >
              {chatTitle}
            </ThemedText>
          )}

          <ScrollView style={styles.projectList}>
            {/* No Project Option */}
            <TouchableOpacity
              style={[
                styles.projectOption,
                { borderColor: theme.text + "20" },
                !isCreatingNew &&
                  selectedProjectId === undefined && {
                    backgroundColor: theme.tint + "20",
                    borderColor: theme.tint,
                  },
              ]}
              onPress={() => handleSelectProject(undefined)}
            >
              <View style={styles.radioContainer}>
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: theme.text + "60" },
                    !isCreatingNew &&
                      selectedProjectId === undefined && {
                        borderColor: theme.tint,
                      },
                  ]}
                >
                  {!isCreatingNew && selectedProjectId === undefined && (
                    <View
                      style={[styles.radioInner, { backgroundColor: theme.tint }]}
                    />
                  )}
                </View>
                <ThemedText style={styles.projectName}>No Project</ThemedText>
              </View>
            </TouchableOpacity>

            {/* Existing Projects */}
            {projects.map((project) => (
              <TouchableOpacity
                key={project.id}
                style={[
                  styles.projectOption,
                  { borderColor: theme.text + "20" },
                  !isCreatingNew &&
                    selectedProjectId === project.id && {
                      backgroundColor: theme.tint + "20",
                      borderColor: theme.tint,
                    },
                ]}
                onPress={() => handleSelectProject(project.id)}
              >
                <View style={styles.radioContainer}>
                  <View
                    style={[
                      styles.radioOuter,
                      { borderColor: theme.text + "60" },
                      !isCreatingNew &&
                        selectedProjectId === project.id && {
                          borderColor: theme.tint,
                        },
                    ]}
                  >
                    {!isCreatingNew && selectedProjectId === project.id && (
                      <View
                        style={[
                          styles.radioInner,
                          { backgroundColor: theme.tint },
                        ]}
                      />
                    )}
                  </View>
                  <ThemedText style={styles.projectName}>
                    {project.name}
                  </ThemedText>
                </View>
              </TouchableOpacity>
            ))}

            {/* Create New Project Option */}
            <TouchableOpacity
              style={[
                styles.projectOption,
                { borderColor: theme.text + "20" },
                isCreatingNew && {
                  backgroundColor: theme.tint + "20",
                  borderColor: theme.tint,
                },
              ]}
              onPress={handleCreateNew}
            >
              <View style={styles.radioContainer}>
                <View
                  style={[
                    styles.radioOuter,
                    { borderColor: theme.text + "60" },
                    isCreatingNew && { borderColor: theme.tint },
                  ]}
                >
                  {isCreatingNew && (
                    <View
                      style={[styles.radioInner, { backgroundColor: theme.tint }]}
                    />
                  )}
                </View>
                <ThemedText style={[styles.projectName, { color: theme.tint }]}>
                  + Create New Project
                </ThemedText>
              </View>
            </TouchableOpacity>

            {/* New Project Name Input */}
            {isCreatingNew && (
              <View style={styles.newProjectInputContainer}>
                <TextInput
                  style={[
                    styles.input,
                    {
                      color: theme.text,
                      borderColor: theme.text + "20",
                      backgroundColor: theme.background,
                    },
                  ]}
                  value={newProjectName}
                  onChangeText={setNewProjectName}
                  placeholder="Enter project name"
                  placeholderTextColor={theme.text + "80"}
                  autoFocus
                />
              </View>
            )}
          </ScrollView>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                {
                  backgroundColor: theme.background,
                  borderColor: theme.text + "20",
                  borderWidth: 1,
                },
              ]}
              onPress={onClose}
            >
              <ThemedText>Cancel</ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.saveButton,
                { backgroundColor: theme.tint },
                isButtonDisabled && styles.disabledButton,
              ]}
              onPress={handleSave}
              disabled={isButtonDisabled}
            >
              <ThemedText
                style={[
                  styles.saveButtonText,
                  { color: colorScheme === "light" ? "white" : theme.text },
                  isButtonDisabled && styles.disabledButtonText,
                ]}
              >
                Save
              </ThemedText>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  modalContent: {
    width: "90%",
    maxWidth: 400,
    maxHeight: "80%",
    borderRadius: 10,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  chatTitlePreview: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 16,
  },
  projectList: {
    maxHeight: 300,
    marginBottom: 16,
  },
  projectOption: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  radioContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  projectName: {
    fontSize: 16,
  },
  newProjectInputContainer: {
    marginTop: 8,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  buttonContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  button: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    marginRight: 10,
  },
  saveButton: {
    marginLeft: 10,
  },
  saveButtonText: {
    fontWeight: "bold",
  },
  disabledButton: {
    opacity: 0.5,
  },
  disabledButtonText: {
    opacity: 0.7,
  },
});
