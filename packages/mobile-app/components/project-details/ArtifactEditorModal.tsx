import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { Artifact } from "../../redux/slices/artifactsSlice";
import { IconSymbol } from "../ui/IconSymbol";

interface ArtifactEditorModalProps {
  visible: boolean;
  artifact: Artifact | null;
  onSave: (name: string, content: string) => void;
  onClose: () => void;
}

export function ArtifactEditorModal({
  visible,
  artifact,
  onSave,
  onClose,
}: ArtifactEditorModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [name, setName] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    if (artifact) {
      setName(artifact.name);
      setContent(artifact.content || "");
    } else {
      setName("");
      setContent("");
    }
  }, [artifact]);

  const handleSave = () => {
    if (name.trim()) {
      onSave(name.trim(), content);
    }
  };

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
        <KeyboardAvoidingView
          style={styles.keyboardView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {/* Header */}
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
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              {artifact ? "Edit File" : "New File"}
            </Text>
            <TouchableOpacity
              style={[styles.headerButton, styles.saveButton]}
              onPress={handleSave}
            >
              <Text style={[styles.saveText, { color: theme.tint }]}>Save</Text>
            </TouchableOpacity>
          </View>

          {/* Name Input */}
          <View style={styles.nameSection}>
            <Text style={[styles.label, { color: theme.text + "99" }]}>
              File Name
            </Text>
            <TextInput
              style={[
                styles.nameInput,
                {
                  color: theme.text,
                  backgroundColor: colorScheme === "dark" ? "#2D2D2D" : "#f5f5f5",
                },
              ]}
              value={name}
              onChangeText={setName}
              placeholder="filename.txt"
              placeholderTextColor={theme.text + "66"}
            />
          </View>

          {/* Content Input */}
          <View style={styles.contentSection}>
            <Text style={[styles.label, { color: theme.text + "99" }]}>
              Content
            </Text>
            <TextInput
              style={[
                styles.contentInput,
                {
                  color: theme.text,
                  backgroundColor: colorScheme === "dark" ? "#2D2D2D" : "#f5f5f5",
                },
              ]}
              value={content}
              onChangeText={setContent}
              placeholder="Enter file content..."
              placeholderTextColor={theme.text + "66"}
              multiline
              textAlignVertical="top"
            />
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboardView: {
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
  saveButton: {
    alignItems: "flex-end",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
  },
  cancelText: {
    fontSize: 16,
  },
  saveText: {
    fontSize: 16,
    fontWeight: "600",
  },
  nameSection: {
    padding: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  nameInput: {
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
  },
  contentSection: {
    flex: 1,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  contentInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    padding: 12,
    borderRadius: 8,
    lineHeight: 20,
  },
});
