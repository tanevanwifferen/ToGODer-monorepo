import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
} from "react-native";
import { useSelector } from "react-redux";
import { IconSymbol } from "../ui/IconSymbol";
import { useColorScheme } from "../../hooks/useColorScheme";
import { Colors } from "../../constants/Colors";
import {
  selectProjects,
  selectCurrentProject,
} from "../../redux/slices/projectsSlice";
import { useProjectActions } from "../../hooks/useProjectActions";

export function ProjectSelector() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const projectsState = useSelector(selectProjects);
  const currentProject = useSelector(selectCurrentProject);
  const { handleCreateProject, handleSelectProject } = useProjectActions();

  const [isExpanded, setIsExpanded] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  const projects = Object.values(projectsState.projects);

  const handleCreate = () => {
    if (newProjectName.trim()) {
      handleCreateProject(newProjectName.trim());
      setNewProjectName("");
      setIsCreating(false);
    }
  };

  const handleSelect = (projectId: string | null) => {
    handleSelectProject(projectId);
    setIsExpanded(false);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.header}
        onPress={() => setIsExpanded(!isExpanded)}
        activeOpacity={0.7}
      >
        <IconSymbol size={24} name="folder.fill" color={theme.icon} />
        <Text style={[styles.headerText, { color: theme.text }]} numberOfLines={1}>
          {currentProject?.name ?? "All Projects"}
        </Text>
        <IconSymbol
          size={18}
          name={isExpanded ? "chevron.up" : "chevron.down"}
          color={theme.icon}
        />
      </TouchableOpacity>

      {isExpanded && (
        <View style={[styles.dropdown, { backgroundColor: theme.background }]}>
          <TouchableOpacity
            style={[
              styles.option,
              !currentProject && styles.optionSelected,
            ]}
            onPress={() => handleSelect(null)}
          >
            <IconSymbol size={20} name="tray.full.fill" color={theme.icon} />
            <Text style={[styles.optionText, { color: theme.text }]}>
              All Projects
            </Text>
            {!currentProject && (
              <IconSymbol size={16} name="checkmark" color={theme.tint} />
            )}
          </TouchableOpacity>

          {projects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={[
                styles.option,
                currentProject?.id === project.id && styles.optionSelected,
              ]}
              onPress={() => handleSelect(project.id)}
            >
              <IconSymbol size={20} name="folder.fill" color={theme.icon} />
              <Text
                style={[styles.optionText, { color: theme.text }]}
                numberOfLines={1}
              >
                {project.name}
              </Text>
              {currentProject?.id === project.id && (
                <IconSymbol size={16} name="checkmark" color={theme.tint} />
              )}
            </TouchableOpacity>
          ))}

          {isCreating ? (
            <View style={styles.createInput}>
              <TextInput
                style={[
                  styles.input,
                  { color: theme.text, borderColor: theme.icon },
                ]}
                placeholder="Project name"
                placeholderTextColor={theme.icon}
                value={newProjectName}
                onChangeText={setNewProjectName}
                onSubmitEditing={handleCreate}
                autoFocus
              />
              <TouchableOpacity onPress={handleCreate} style={styles.iconButton}>
                <IconSymbol size={20} name="checkmark.circle.fill" color={theme.tint} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setIsCreating(false);
                  setNewProjectName("");
                }}
                style={styles.iconButton}
              >
                <IconSymbol size={20} name="xmark.circle.fill" color={theme.icon} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.option}
              onPress={() => setIsCreating(true)}
            >
              <IconSymbol size={20} name="plus.circle.fill" color={theme.tint} />
              <Text style={[styles.optionText, { color: theme.tint }]}>
                New Project
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ccc",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  headerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: "600",
  },
  dropdown: {
    marginTop: 4,
    borderRadius: 8,
    overflow: "hidden",
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  optionSelected: {
    backgroundColor: "rgba(0, 0, 0, 0.05)",
  },
  optionText: {
    flex: 1,
    fontSize: 14,
  },
  createInput: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 14,
  },
  iconButton: {
    padding: 4,
  },
});
