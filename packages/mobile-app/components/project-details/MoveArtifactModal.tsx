import React, { useState, useMemo } from "react";
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
import { Artifact, selectAllArtifacts } from "../../redux/slices/artifactsSlice";
import { IconSymbol } from "../ui/IconSymbol";

interface MoveArtifactModalProps {
  visible: boolean;
  artifact: Artifact | null;
  projectId: string;
  onMove: (newParentId: string | null) => void;
  onClose: () => void;
}

export function MoveArtifactModal({
  visible,
  artifact,
  projectId,
  onMove,
  onClose,
}: MoveArtifactModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const allArtifacts = useSelector(selectAllArtifacts);

  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  // Get all folders in the project
  const projectFolders = useMemo(() => {
    return Object.values(allArtifacts).filter(
      (a) => a.projectId === projectId && a.type === "folder"
    );
  }, [allArtifacts, projectId]);

  // Get all descendant IDs of the artifact being moved (to disable them as targets)
  const disabledIds = useMemo(() => {
    if (!artifact) return new Set<string>();

    const descendants = new Set<string>();
    descendants.add(artifact.id); // Can't move to self

    if (artifact.type === "folder") {
      const getDescendants = (parentId: string) => {
        const children = Object.values(allArtifacts).filter(
          (a) => a.parentId === parentId
        );
        for (const child of children) {
          descendants.add(child.id);
          if (child.type === "folder") {
            getDescendants(child.id);
          }
        }
      };
      getDescendants(artifact.id);
    }

    return descendants;
  }, [artifact, allArtifacts]);

  // Group folders by parent
  const foldersByParent = useMemo(() => {
    const map: { [key: string]: Artifact[] } = { root: [] };

    for (const folder of projectFolders) {
      const parentKey = folder.parentId ?? "root";
      if (!map[parentKey]) {
        map[parentKey] = [];
      }
      map[parentKey].push(folder);
    }

    // Sort alphabetically
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.name.localeCompare(b.name));
    }

    return map;
  }, [projectFolders]);

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleMove = () => {
    onMove(selectedParentId);
    setSelectedParentId(null);
  };

  const handleClose = () => {
    setSelectedParentId(null);
    onClose();
  };

  const renderFolderItem = (folder: Artifact, level: number) => {
    const isDisabled = disabledIds.has(folder.id);
    const isSelected = selectedParentId === folder.id;
    const isExpanded = expandedFolders.has(folder.id);
    const hasChildren = (foldersByParent[folder.id] || []).length > 0;
    const indentWidth = level * 20;

    return (
      <View key={folder.id}>
        <TouchableOpacity
          style={[
            styles.folderItem,
            { paddingLeft: indentWidth + 16 },
            isSelected && { backgroundColor: theme.tint + "20" },
          ]}
          onPress={() => !isDisabled && setSelectedParentId(folder.id)}
          disabled={isDisabled}
          activeOpacity={0.7}
        >
          {hasChildren ? (
            <TouchableOpacity
              onPress={() => toggleFolder(folder.id)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <IconSymbol
                name="chevron.right"
                size={12}
                color={theme.text + "99"}
                style={[
                  styles.chevron,
                  { transform: [{ rotate: isExpanded ? "90deg" : "0deg" }] },
                ]}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.chevronPlaceholder} />
          )}
          <View
            style={[
              styles.radioOuter,
              { borderColor: isDisabled ? theme.text + "33" : theme.tint },
            ]}
          >
            {isSelected && (
              <View style={[styles.radioInner, { backgroundColor: theme.tint }]} />
            )}
          </View>
          <IconSymbol
            name="folder.fill"
            size={18}
            color={isDisabled ? theme.text + "33" : theme.tint}
            style={styles.folderIcon}
          />
          <Text
            style={[
              styles.folderName,
              { color: isDisabled ? theme.text + "33" : theme.text },
            ]}
            numberOfLines={1}
          >
            {folder.name}
          </Text>
        </TouchableOpacity>
        {isExpanded && renderFolderChildren(folder.id, level + 1)}
      </View>
    );
  };

  const renderFolderChildren = (parentId: string, level: number) => {
    const children = foldersByParent[parentId] || [];
    return children.map((folder) => renderFolderItem(folder, level));
  };

  const isRootSelected = selectedParentId === null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.background }]}
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { borderBottomColor: colorScheme === "dark" ? "#333" : "#eee" },
          ]}
        >
          <TouchableOpacity style={styles.headerButton} onPress={handleClose}>
            <Text style={[styles.cancelText, { color: theme.text + "99" }]}>
              Cancel
            </Text>
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.text }]}>
            Move "{artifact?.name}"
          </Text>
          <TouchableOpacity
            style={[styles.headerButton, styles.moveButton]}
            onPress={handleMove}
          >
            <Text style={[styles.moveText, { color: theme.tint }]}>Move</Text>
          </TouchableOpacity>
        </View>

        {/* Info */}
        <View style={styles.infoSection}>
          <Text style={[styles.infoText, { color: theme.text + "99" }]}>
            Select a destination folder
          </Text>
        </View>

        {/* Folder Tree */}
        <ScrollView style={styles.treeContainer}>
          {/* Root option */}
          <TouchableOpacity
            style={[
              styles.folderItem,
              { paddingLeft: 16 },
              isRootSelected && { backgroundColor: theme.tint + "20" },
            ]}
            onPress={() => setSelectedParentId(null)}
            activeOpacity={0.7}
          >
            <View style={styles.chevronPlaceholder} />
            <View
              style={[styles.radioOuter, { borderColor: theme.tint }]}
            >
              {isRootSelected && (
                <View style={[styles.radioInner, { backgroundColor: theme.tint }]} />
              )}
            </View>
            <IconSymbol
              name="folder"
              size={18}
              color={theme.tint}
              style={styles.folderIcon}
            />
            <Text style={[styles.folderName, { color: theme.text }]}>
              / (Root)
            </Text>
          </TouchableOpacity>

          {/* Folder tree */}
          {renderFolderChildren("root", 0)}
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
  moveButton: {
    alignItems: "flex-end",
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
  moveText: {
    fontSize: 16,
    fontWeight: "600",
  },
  infoSection: {
    padding: 16,
  },
  infoText: {
    fontSize: 14,
  },
  treeContainer: {
    flex: 1,
  },
  folderItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingRight: 16,
  },
  chevron: {
    marginRight: 8,
  },
  chevronPlaceholder: {
    width: 12,
    marginRight: 8,
  },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  folderIcon: {
    marginRight: 8,
  },
  folderName: {
    fontSize: 16,
    flex: 1,
  },
});
