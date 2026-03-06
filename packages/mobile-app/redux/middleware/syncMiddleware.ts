import { Middleware } from "@reduxjs/toolkit";
import { SyncService } from "../../services/SyncService";

// Actions that should trigger a sync push
const SYNC_TRIGGERING_ACTIONS = [
  // Chat actions
  "chats/addChat",
  "chats/addMessage",
  "chats/updateMessageAtIndex",
  "chats/deleteMessage",
  "chats/deleteMessageByContent",
  "chats/updateSettings",
  "chats/setTitle",
  "chats/deleteChat",
  "chats/clearAllChats",
  "chats/addMemories",
  "chats/updateDraftInputText",
  // Personal actions
  "personal/setPersonalData",
  "personal/setPersona",
  // User settings actions
  "userSettings/setUserSettings",
  // Project actions
  "projects/addProject",
  "projects/updateProject",
  "projects/deleteProject",
  "projects/addChatToProject",
  "projects/removeChatFromProject",
  "projects/clearAllProjects",
  // Artifact actions
  "artifacts/addArtifact",
  "artifacts/updateArtifact",
  "artifacts/deleteArtifact",
  "artifacts/deleteProjectArtifacts",
  "artifacts/moveArtifact",
];

// Actions that come from sync and should NOT trigger another sync
const SYNC_INTERNAL_ACTIONS = [
  "chats/setChatsFromSync",
  "personal/setPersonalFromSync",
  "userSettings/setUserSettingsFromSync",
  "projects/setProjectsFromSync",
  "artifacts/setArtifactsFromSync",
];

/**
 * Redux middleware that detects state changes and triggers sync
 */
export const syncMiddleware: Middleware = () => (next) => (action: any) => {
  const result = next(action);

  // Skip if this is an internal sync action (to avoid loops)
  if (SYNC_INTERNAL_ACTIONS.includes(action.type)) {
    return result;
  }

  // Check if this action should trigger a sync
  if (SYNC_TRIGGERING_ACTIONS.includes(action.type)) {
    const syncService = SyncService.getInstance();
    if (syncService.isReady()) {
      syncService.queuePush();
    }
  }

  return result;
};
