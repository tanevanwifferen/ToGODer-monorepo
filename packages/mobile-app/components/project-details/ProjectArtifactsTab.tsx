import React, { useState } from "react";
import {
  StyleSheet,
  View,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { useDispatch, useSelector } from "react-redux";
import { v4 as uuidv4 } from "uuid";
import Toast from "react-native-toast-message";
import { Colors } from "../../constants/Colors";
import {
  addArtifact,
  deleteArtifact,
  updateArtifact,
  moveArtifact,
  Artifact,
} from "../../redux/slices/artifactsSlice";
import { RootState } from "../../redux/store";
import { ArtifactTree } from "../artifact-tree";
import { IconSymbol } from "../ui/IconSymbol";
import { ArtifactEditorModal } from "./ArtifactEditorModal";
import { MoveArtifactModal } from "./MoveArtifactModal";
import { TextInputModal } from "./TextInputModal";
import { DeleteConfirmModal } from "./DeleteConfirmModal";
import { ArtifactActionsModal } from "./ArtifactActionsModal";
import { ShareModal } from "../shared/ShareModal";
import { ShareApiClient } from "../../apiClients/ShareApiClient";
import {
  ShareRequest,
  SharedArtifact,
  SignedInstructionSnapshot,
} from "../../model/ShareTypes";

interface ProjectArtifactsTabProps {
  projectId: string;
}

export function ProjectArtifactsTab({ projectId }: ProjectArtifactsTabProps) {
  const dispatch = useDispatch();
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [selectedArtifact, setSelectedArtifact] = useState<Artifact | null>(null);
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingArtifact, setEditingArtifact] = useState<Artifact | null>(null);
  const [moveModalVisible, setMoveModalVisible] = useState(false);
  const [movingArtifact, setMovingArtifact] = useState<Artifact | null>(null);

  // New modal states
  const [createFolderModalVisible, setCreateFolderModalVisible] = useState(false);
  const [createFileModalVisible, setCreateFileModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);
  const [deletingArtifact, setDeletingArtifact] = useState<Artifact | null>(null);
  const [actionsModalVisible, setActionsModalVisible] = useState(false);
  const [actionArtifact, setActionArtifact] = useState<Artifact | null>(null);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renamingArtifact, setRenamingArtifact] = useState<Artifact | null>(null);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  const [sharingArtifact, setSharingArtifact] = useState<Artifact | null>(null);
  const [sharedArtifact, setSharedArtifact] = useState<SharedArtifact | null>(null);
  const [isSharing, setIsSharing] = useState(false);

  const allChats = useSelector((state: RootState) => state.chats.chats);

  // Signed custom-instruction snapshots from every chat in this project,
  // merged chronologically with consecutive duplicates dropped. They document
  // which instructions were active while the project's artifacts were created.
  const projectInstructionHistory = React.useMemo(() => {
    const merged: SignedInstructionSnapshot[] = [];
    for (const chat of Object.values(allChats)) {
      if (chat.projectId !== projectId || chat.deleted) continue;
      merged.push(...(chat.instructionHistory ?? []));
    }
    merged.sort((a, b) => a.timestamp - b.timestamp);
    return merged.filter(
      (entry, i) => i === 0 || entry.content !== merged[i - 1].content
    );
  }, [allChats, projectId]);

  const handleAddFolder = () => {
    setCreateFolderModalVisible(true);
  };

  const handleCreateFolder = (name: string) => {
    dispatch(
      addArtifact({
        id: uuidv4(),
        projectId,
        name,
        type: "folder",
        parentId: selectedArtifact?.type === "folder" ? selectedArtifact.id : null,
      })
    );
  };

  const handleAddFile = () => {
    setCreateFileModalVisible(true);
  };

  const handleCreateFile = (name: string) => {
    const newArtifact: Omit<Artifact, "createdAt" | "updatedAt"> = {
      id: uuidv4(),
      projectId,
      name,
      type: "file",
      parentId: selectedArtifact?.type === "folder" ? selectedArtifact.id : null,
      content: "",
    };
    dispatch(addArtifact(newArtifact));
  };

  const handleDeleteArtifact = (artifact: Artifact) => {
    setDeletingArtifact(artifact);
    setDeleteModalVisible(true);
  };

  const handleConfirmDelete = () => {
    if (deletingArtifact) {
      dispatch(deleteArtifact(deletingArtifact.id));
      if (selectedArtifact?.id === deletingArtifact.id) {
        setSelectedArtifact(null);
      }
    }
    setDeletingArtifact(null);
  };

  const handleRenameArtifact = (artifact: Artifact) => {
    setRenamingArtifact(artifact);
    setRenameModalVisible(true);
  };

  const handleConfirmRename = (newName: string) => {
    if (renamingArtifact) {
      dispatch(
        updateArtifact({
          id: renamingArtifact.id,
          updates: { name: newName },
        })
      );
    }
    setRenamingArtifact(null);
  };

  const handleMoveArtifact = (artifact: Artifact) => {
    setMovingArtifact(artifact);
    setMoveModalVisible(true);
  };

  const handleShareArtifact = (artifact: Artifact) => {
    setSharingArtifact(artifact);
    setSharedArtifact(null);
    setShareModalVisible(true);
  };

  const handleConfirmShare = async (request: ShareRequest) => {
    if (!sharingArtifact) return;
    setIsSharing(true);
    try {
      const result = await ShareApiClient.shareArtifact({
        title: request.title,
        description: request.description,
        content: sharingArtifact.content ?? "",
        visibility: request.visibility,
        instructionHistory:
          projectInstructionHistory.length > 0
            ? projectInstructionHistory
            : undefined,
      });
      setSharedArtifact(result);
      Toast.show({
        type: "success",
        text1: "Artifact shared successfully",
      });
    } catch (error) {
      Toast.show({
        type: "error",
        text1: "Failed to share artifact",
        text2: error instanceof Error ? error.message : "Unknown error occurred",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const handleMoveConfirm = (newParentId: string | null) => {
    if (movingArtifact) {
      dispatch(moveArtifact({ id: movingArtifact.id, newParentId }));
    }
    setMoveModalVisible(false);
    setMovingArtifact(null);
  };

  const handleLongPressArtifact = (artifact: Artifact) => {
    setActionArtifact(artifact);
    setActionsModalVisible(true);
  };

  const handleSelectArtifact = (artifact: Artifact) => {
    setSelectedArtifact(artifact);
    if (artifact.type === "file") {
      setEditingArtifact(artifact);
      setEditorVisible(true);
    }
  };

  const handleSaveArtifact = (name: string, content: string) => {
    if (editingArtifact) {
      dispatch(
        updateArtifact({
          id: editingArtifact.id,
          updates: { name, content },
        })
      );
    }
    setEditorVisible(false);
    setEditingArtifact(null);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.tint + "20" }]}
            onPress={handleAddFolder}
          >
            <IconSymbol name="folder.badge.plus" size={18} color={theme.tint} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.iconButton, { backgroundColor: theme.tint + "20" }]}
            onPress={handleAddFile}
          >
            <IconSymbol name="doc.badge.plus" size={18} color={theme.tint} />
          </TouchableOpacity>
        </View>
      </View>
      <View
        style={[
          styles.treeContainer,
          { backgroundColor: colorScheme === "dark" ? "#2D2D2D" : "#f5f5f5" },
        ]}
      >
        <ArtifactTree
          projectId={projectId}
          onSelectArtifact={handleSelectArtifact}
          onLongPressArtifact={handleLongPressArtifact}
        />
      </View>

      <ArtifactEditorModal
        visible={editorVisible}
        artifact={editingArtifact}
        onSave={handleSaveArtifact}
        onClose={() => {
          setEditorVisible(false);
          setEditingArtifact(null);
        }}
      />

      <MoveArtifactModal
        visible={moveModalVisible}
        artifact={movingArtifact}
        projectId={projectId}
        onMove={handleMoveConfirm}
        onClose={() => {
          setMoveModalVisible(false);
          setMovingArtifact(null);
        }}
      />

      <TextInputModal
        visible={createFolderModalVisible}
        title="New Folder"
        placeholder="Folder name"
        submitLabel="Create"
        onSubmit={handleCreateFolder}
        onClose={() => setCreateFolderModalVisible(false)}
      />

      <TextInputModal
        visible={createFileModalVisible}
        title="New File"
        placeholder="File name"
        submitLabel="Create"
        onSubmit={handleCreateFile}
        onClose={() => setCreateFileModalVisible(false)}
      />

      <TextInputModal
        visible={renameModalVisible}
        title="Rename"
        placeholder="New name"
        initialValue={renamingArtifact?.name ?? ""}
        submitLabel="Rename"
        onSubmit={handleConfirmRename}
        onClose={() => {
          setRenameModalVisible(false);
          setRenamingArtifact(null);
        }}
      />

      <DeleteConfirmModal
        visible={deleteModalVisible}
        itemName={deletingArtifact?.name ?? ""}
        itemType={deletingArtifact?.type ?? "file"}
        onConfirm={handleConfirmDelete}
        onClose={() => {
          setDeleteModalVisible(false);
          setDeletingArtifact(null);
        }}
      />

      <ArtifactActionsModal
        visible={actionsModalVisible}
        artifact={actionArtifact}
        onRename={() => actionArtifact && handleRenameArtifact(actionArtifact)}
        onMove={() => actionArtifact && handleMoveArtifact(actionArtifact)}
        onShare={() => actionArtifact && handleShareArtifact(actionArtifact)}
        onDelete={() => actionArtifact && handleDeleteArtifact(actionArtifact)}
        onClose={() => {
          setActionsModalVisible(false);
          setActionArtifact(null);
        }}
      />

      <ShareModal
        visible={shareModalVisible}
        onClose={() => {
          setShareModalVisible(false);
          setSharingArtifact(null);
          setSharedArtifact(null);
        }}
        onShare={handleConfirmShare}
        initialTitle={sharingArtifact?.name ?? ""}
        isLoading={isSharing}
        sharedId={sharedArtifact?.id}
        entityLabel="Artifact"
        pathPrefix="artifact"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 12,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
  },
  iconButton: {
    padding: 8,
    borderRadius: 6,
  },
  treeContainer: {
    borderRadius: 8,
    minHeight: 200,
    flex: 1,
    overflow: "hidden",
  },
});
