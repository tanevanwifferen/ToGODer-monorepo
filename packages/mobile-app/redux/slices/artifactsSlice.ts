import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../store";

export interface Artifact {
  id: string;
  projectId: string;
  name: string;
  type: "file" | "folder";
  parentId: string | null; // null for root level
  content?: string; // for files
  createdAt: number;
  updatedAt: number;
  deleted?: boolean; // tombstone for sync
  deletedAt?: number; // when deletion occurred
}

export interface ArtifactsState {
  artifacts: {
    [id: string]: Artifact;
  };
}

const initialState: ArtifactsState = {
  artifacts: {},
};

const artifactsSlice = createSlice({
  name: "artifacts",
  initialState,
  reducers: {
    addArtifact: (
      state,
      action: PayloadAction<Omit<Artifact, "createdAt" | "updatedAt">>
    ) => {
      const now = Date.now();
      state.artifacts[action.payload.id] = {
        ...action.payload,
        createdAt: now,
        updatedAt: now,
      };
    },
    updateArtifact: (
      state,
      action: PayloadAction<{
        id: string;
        updates: Partial<Omit<Artifact, "id" | "projectId" | "createdAt">>;
      }>
    ) => {
      const { id, updates } = action.payload;
      const artifact = state.artifacts[id];
      if (artifact) {
        state.artifacts[id] = {
          ...artifact,
          ...updates,
          updatedAt: Date.now(),
        };
      }
    },
    deleteArtifact: (state, action: PayloadAction<string>) => {
      const artifactId = action.payload;
      const artifact = state.artifacts[artifactId];
      if (!artifact) return;

      const now = Date.now();

      // Mark as deleted (tombstone) for sync instead of removing
      const markDeleted = (id: string) => {
        const a = state.artifacts[id];
        if (a) {
          a.deleted = true;
          a.deletedAt = now;
          a.updatedAt = now;
        }
      };

      // If it's a folder, recursively mark children as deleted
      if (artifact.type === "folder") {
        const childIds = Object.values(state.artifacts)
          .filter((a) => a.parentId === artifactId && !a.deleted)
          .map((a) => a.id);

        // Mark children recursively as deleted
        const deleteRecursive = (ids: string[]) => {
          for (const id of ids) {
            const child = state.artifacts[id];
            if (child?.type === "folder") {
              const grandchildIds = Object.values(state.artifacts)
                .filter((a) => a.parentId === id && !a.deleted)
                .map((a) => a.id);
              deleteRecursive(grandchildIds);
            }
            markDeleted(id);
          }
        };
        deleteRecursive(childIds);
      }

      markDeleted(artifactId);
    },
    deleteProjectArtifacts: (state, action: PayloadAction<string>) => {
      const projectId = action.payload;
      const now = Date.now();
      const artifactIds = Object.values(state.artifacts)
        .filter((a) => a.projectId === projectId && !a.deleted)
        .map((a) => a.id);

      for (const id of artifactIds) {
        const artifact = state.artifacts[id];
        if (artifact) {
          artifact.deleted = true;
          artifact.deletedAt = now;
          artifact.updatedAt = now;
        }
      }
    },
    moveArtifact: (
      state,
      action: PayloadAction<{ id: string; newParentId: string | null }>
    ) => {
      const { id, newParentId } = action.payload;
      const artifact = state.artifacts[id];
      if (artifact) {
        artifact.parentId = newParentId;
        artifact.updatedAt = Date.now();
      }
    },
    // Set artifacts from sync - replaces all artifacts with synced data
    setArtifactsFromSync: (
      state,
      action: PayloadAction<Record<string, Artifact>>
    ) => {
      state.artifacts = action.payload;
    },
  },
});

export const {
  addArtifact,
  updateArtifact,
  deleteArtifact,
  deleteProjectArtifacts,
  moveArtifact,
  setArtifactsFromSync,
} = artifactsSlice.actions;

// Selectors - filter out deleted artifacts
export const selectAllArtifacts = (state: RootState) =>
  Object.fromEntries(
    Object.entries(state.artifacts.artifacts).filter(([_, a]) => !a.deleted)
  );

export const selectProjectArtifacts = (state: RootState, projectId: string) =>
  Object.values(state.artifacts.artifacts).filter(
    (artifact) => artifact.projectId === projectId && !artifact.deleted
  );

export const selectArtifactChildren = (
  state: RootState,
  parentId: string | null,
  projectId: string
) =>
  Object.values(state.artifacts.artifacts).filter(
    (artifact) =>
      artifact.projectId === projectId &&
      artifact.parentId === parentId &&
      !artifact.deleted
  );

export default artifactsSlice.reducer;
