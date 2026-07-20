/**
 * Modal for picking a project to import a shared artifact into.
 * Lists the user's non-deleted projects; selecting one calls onImport with
 * the project id. Shown from the read-only SharedArtifactView.
 */

import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  ScrollView,
  useColorScheme,
} from "react-native";
import { useSelector } from "react-redux";
import { Colors } from "../../constants/Colors";
import { selectProjectList } from "../../redux/slices/projectsSlice";
import { IconSymbol } from "../ui/IconSymbol";

interface ImportToProjectModalProps {
  visible: boolean;
  artifactTitle: string;
  onImport: (projectId: string) => void;
  onClose: () => void;
}

export function ImportToProjectModal({
  visible,
  artifactTitle,
  onImport,
  onClose,
}: ImportToProjectModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const projects = useSelector(selectProjectList);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        <View
          style={[
            styles.header,
            { borderBottomColor: colorScheme === "dark" ? "#333" : "#eee" },
          ]}
        >
          <TouchableOpacity style={styles.headerButton} onPress={onClose}>
            <Text style={[styles.cancelText, { color: theme.text + "99" }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text
            style={[styles.headerTitle, { color: theme.text }]}
            numberOfLines={1}
          >
            Import "{artifactTitle}"
          </Text>
          <View style={styles.headerButton} />
        </View>

        <View style={styles.infoSection}>
          <Text style={[styles.infoText, { color: theme.text + "99" }]}>
            Select a project to import into
          </Text>
        </View>

        <ScrollView style={styles.listContainer}>
          {projects.length === 0 && (
            <View style={styles.emptyState}>
              <IconSymbol name="folder" size={32} color={theme.text + "33"} />
              <Text style={[styles.emptyText, { color: theme.text + "99" }]}>
                You don't have any projects yet.
              </Text>
              <Text style={[styles.emptySubtext, { color: theme.text + "66" }]}>
                Create a project first, then import this artifact.
              </Text>
            </View>
          )}

          {projects.map((project) => (
            <TouchableOpacity
              key={project.id}
              style={[
                styles.projectItem,
                { backgroundColor: theme.text + "08" },
              ]}
              onPress={() => onImport(project.id)}
              activeOpacity={0.7}
            >
              <IconSymbol name="folder.fill" size={20} color={theme.tint} />
              <Text
                style={[styles.projectName, { color: theme.text }]}
                numberOfLines={1}
              >
                {project.name}
              </Text>
              <IconSymbol
                name="square.and.arrow.down"
                size={18}
                color={theme.tint}
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  headerButton: {
    minWidth: 60,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    flex: 1,
    textAlign: "center",
  },
  cancelText: {
    fontSize: 16,
  },
  infoSection: {
    padding: 16,
  },
  infoText: {
    fontSize: 14,
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
  },
  projectItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  projectName: {
    flex: 1,
    fontSize: 16,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
  },
});
