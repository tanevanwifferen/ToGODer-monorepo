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
import { IconSymbol, IconSymbolName } from "../ui/IconSymbol";
import { Artifact } from "../../redux/slices/artifactsSlice";

interface ActionItem {
  id: string;
  label: string;
  icon: IconSymbolName;
  color?: string;
  destructive?: boolean;
}

interface ArtifactActionsModalProps {
  visible: boolean;
  artifact: Artifact | null;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
}

const ACTIONS: ActionItem[] = [
  { id: "rename", label: "Rename", icon: "pencil" },
  { id: "move", label: "Move to...", icon: "folder" },
  { id: "delete", label: "Delete", icon: "trash", destructive: true },
];

export function ArtifactActionsModal({
  visible,
  artifact,
  onRename,
  onMove,
  onDelete,
  onClose,
}: ArtifactActionsModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  if (!artifact) return null;

  const handleAction = (actionId: string) => {
    onClose();
    // Small delay to allow modal to close smoothly before opening another
    setTimeout(() => {
      switch (actionId) {
        case "rename":
          onRename();
          break;
        case "move":
          onMove();
          break;
        case "delete":
          onDelete();
          break;
      }
    }, 100);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View
          style={[styles.container, { backgroundColor: theme.background }]}
          onStartShouldSetResponder={() => true}
        >
          {/* Header */}
          <View
            style={[
              styles.header,
              { borderBottomColor: colorScheme === "dark" ? "#333" : "#eee" },
            ]}
          >
            <IconSymbol
              name={artifact.type === "folder" ? "folder.fill" : "doc.fill"}
              size={20}
              color={theme.tint}
            />
            <Text
              style={[styles.headerTitle, { color: theme.text }]}
              numberOfLines={1}
            >
              {artifact.name}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionList}>
            {ACTIONS.map((action, index) => (
              <TouchableOpacity
                key={action.id}
                style={[
                  styles.actionItem,
                  index < ACTIONS.length - 1 && {
                    borderBottomColor: colorScheme === "dark" ? "#333" : "#eee",
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}
                onPress={() => handleAction(action.id)}
              >
                <IconSymbol
                  name={action.icon}
                  size={20}
                  color={action.destructive ? "#ff4444" : theme.text}
                />
                <Text
                  style={[
                    styles.actionLabel,
                    { color: action.destructive ? "#ff4444" : theme.text },
                  ]}
                >
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Cancel button */}
          <TouchableOpacity
            style={[
              styles.cancelButton,
              { backgroundColor: colorScheme === "dark" ? "#2D2D2D" : "#f5f5f5" },
            ]}
            onPress={onClose}
          >
            <Text style={[styles.cancelText, { color: theme.text }]}>
              Cancel
            </Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  container: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 34, // Safe area padding
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
    flex: 1,
  },
  actionList: {
    paddingVertical: 8,
  },
  actionItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 16,
  },
  actionLabel: {
    fontSize: 16,
  },
  cancelButton: {
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
