import { Middleware } from "@reduxjs/toolkit";
import { SyncService } from "../../services/SyncService";
import { ChatApiClient } from "../../apiClients/ChatApiClient";
import { clearPdfAttachment } from "../slices/pdfUploadSlice";

/** Release the persisted PDF attachment(s) for a chat on delete/clear. */
function releasePdfForChat(
  getState: () => any,
  dispatch: any,
  chatId?: string,
): void {
  const byChat = (getState().pdfUpload?.byChat ?? {}) as Record<
    string,
    { id: string; name: string }
  >;
  const ids = chatId
    ? byChat[chatId]
      ? [byChat[chatId]]
      : []
    : Object.values(byChat);
  for (const att of ids) {
    // chatId for release: per-attachment key when iterating all
    ChatApiClient.releasePdf(att.id, chatId ?? "").catch(() => {});
  }
  if (chatId) {
    dispatch(clearPdfAttachment({ chatId }));
  }
}

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
  "userSettings/setModel",
  "userSettings/setCommunicationStyle",
  "userSettings/setLanguage",
  "userSettings/setAssistantName",
  "userSettings/setHumanPrompt",
  "userSettings/setKeepGoing",
  "userSettings/setOutsideBox",
  "userSettings/setHolisticTherapist",
  "userSettings/setLibraryIntegrationEnabled",
  "userSettings/updateSettings",
  "userSettings/setCustomSystemPrompt",
  "userSettings/clearCustomSystemPrompt",
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
  // Memory actions
  "memories/setMemory",
  "memories/deleteMemory",
];

// Actions that come from sync and should NOT trigger another sync
const SYNC_INTERNAL_ACTIONS = [
  "chats/setChatsFromSync",
  "personal/setPersonalFromSync",
  "userSettings/setUserSettingsFromSync",
  "projects/setProjectsFromSync",
  "artifacts/setArtifactsFromSync",
  "memories/setMemoriesFromSync",
  "memories/markMemoriesMigrated",
];

/**
 * Redux middleware that detects state changes and triggers sync
 */
export const syncMiddleware: Middleware = (storeApi) => (next) => (action: any) => {
  // Release persisted PDF ciphertext when a chat is deleted or all chats are
  // cleared, so the server doc store doesn't leak orphaned uploads.
  if (action.type === "chats/deleteChat" && typeof action.payload === "string") {
    releasePdfForChat(storeApi.getState, storeApi.dispatch, action.payload);
  } else if (action.type === "chats/clearAllChats") {
    releasePdfForChat(storeApi.getState, storeApi.dispatch, undefined);
  }

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
