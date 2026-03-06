import React from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Modal,
  useColorScheme,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { IconSymbol } from "../ui/IconSymbol";

interface DeleteConfirmModalProps {
  visible: boolean;
  itemName: string;
  itemType: "file" | "folder";
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteConfirmModal({
  visible,
  itemName,
  itemType,
  onConfirm,
  onClose,
}: DeleteConfirmModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const message =
    itemType === "folder"
      ? `This will permanently delete the folder "${itemName}" and all its contents.`
      : `This will permanently delete "${itemName}".`;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <View style={styles.iconContainer}>
            <IconSymbol name="trash.fill" size={32} color="#ff4444" />
          </View>

          <Text style={[styles.title, { color: theme.text }]}>
            Delete {itemType === "folder" ? "Folder" : "File"}?
          </Text>

          <Text style={[styles.message, { color: theme.text + "99" }]}>
            {message}
          </Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                { borderColor: theme.text + "33" },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.buttonText, { color: theme.text + "99" }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.deleteButton]}
              onPress={handleConfirm}
            >
              <Text style={[styles.buttonText, { color: "#fff" }]}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  container: {
    width: "85%",
    maxWidth: 400,
    borderRadius: 12,
    padding: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
    alignItems: "center",
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#ff444420",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    fontSize: 14,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  buttonRow: {
    flexDirection: "row",
    width: "100%",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    borderWidth: 1,
  },
  deleteButton: {
    backgroundColor: "#ff4444",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
