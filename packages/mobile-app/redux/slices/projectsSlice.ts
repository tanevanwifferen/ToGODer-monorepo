import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { RootState } from "../store";

export interface Project {
  id: string;
  name: string;
  description?: string;
  chatIds: string[];
  createdAt: number;
  updatedAt: number;
  deleted?: boolean; // Tombstone marker for sync
  deletedAt?: number; // When the project was deleted
}

export interface ProjectsState {
  projects: {
    [id: string]: Project;
  };
  currentProjectId: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: ProjectsState = {
  projects: {},
  currentProjectId: null,
  isLoading: false,
  error: null,
};

const projectsSlice = createSlice({
  name: "projects",
  initialState,
  reducers: {
    addProject: (
      state,
      action: PayloadAction<Omit<Project, "createdAt" | "updatedAt">>
    ) => {
      const now = new Date().getTime();
      state.projects[action.payload.id] = {
        ...action.payload,
        createdAt: now,
        updatedAt: now,
      };
    },
    updateProject: (
      state,
      action: PayloadAction<{
        id: string;
        updates: Partial<Omit<Project, "id" | "createdAt">>;
      }>
    ) => {
      const { id, updates } = action.payload;
      const project = state.projects[id];
      if (project) {
        state.projects[id] = {
          ...project,
          ...updates,
          updatedAt: new Date().getTime(),
        };
      }
    },
    deleteProject: (state, action: PayloadAction<string>) => {
      const project = state.projects[action.payload];
      if (project) {
        // Mark as deleted (tombstone) for sync instead of removing
        const now = new Date().getTime();
        project.deleted = true;
        project.deletedAt = now;
        project.updatedAt = now;
      }
      if (state.currentProjectId === action.payload) {
        state.currentProjectId = null;
      }
    },
    setCurrentProject: (state, action: PayloadAction<string | null>) => {
      state.currentProjectId = action.payload;
    },
    addChatToProject: (
      state,
      action: PayloadAction<{ projectId: string; chatId: string }>
    ) => {
      const { projectId, chatId } = action.payload;
      const project = state.projects[projectId];
      if (project && !project.chatIds.includes(chatId)) {
        project.chatIds.push(chatId);
        project.updatedAt = new Date().getTime();
      }
    },
    removeChatFromProject: (
      state,
      action: PayloadAction<{ projectId: string; chatId: string }>
    ) => {
      const { projectId, chatId } = action.payload;
      const project = state.projects[projectId];
      if (project) {
        project.chatIds = project.chatIds.filter((id) => id !== chatId);
        project.updatedAt = new Date().getTime();
      }
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearAllProjects: (state) => {
      state.projects = {};
      state.currentProjectId = null;
    },
    // Set projects from sync - replaces all projects with synced data
    setProjectsFromSync: (
      state,
      action: PayloadAction<Record<string, Project>>
    ) => {
      state.projects = action.payload;
      // Keep current project if it still exists and is not deleted
      if (state.currentProjectId) {
        const current = action.payload[state.currentProjectId];
        if (!current || current.deleted) {
          state.currentProjectId = null;
        }
      }
    },
  },
});

export const {
  addProject,
  updateProject,
  deleteProject,
  setCurrentProject,
  addChatToProject,
  removeChatFromProject,
  setLoading,
  setError,
  clearAllProjects,
  setProjectsFromSync,
} = projectsSlice.actions;

// Filter out deleted projects in selectors
export const selectProjects = (state: RootState) => ({
  ...state.projects,
  projects: Object.fromEntries(
    Object.entries(state.projects.projects).filter(([_, p]) => !p.deleted)
  ),
});

export const selectProjectList = (state: RootState) =>
  Object.values(state.projects.projects).filter((p) => !p.deleted);

export const selectCurrentProject = (state: RootState) => {
  if (!state.projects.currentProjectId) return null;
  const project = state.projects.projects[state.projects.currentProjectId];
  return project && !project.deleted ? project : null;
};

export default projectsSlice.reducer;
