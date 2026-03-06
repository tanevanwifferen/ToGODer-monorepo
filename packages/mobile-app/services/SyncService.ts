import { store } from "../redux/store";
import { CryptoService } from "./sync/CryptoService";
import { SyncApiClient } from "../apiClients/SyncApiClient";
import { mergeSyncPayloads, hasLocalChanges } from "./sync/mergeUtils";
import {
  SyncPayload,
  SyncableChat,
  SyncableMessage,
  SyncablePersonal,
  SyncableUserSettings,
  SyncableProject,
  SyncableArtifact,
  SYNC_VERSION,
} from "./sync/types";
import { ChatsState, setChatsFromSync } from "../redux/slices/chatsSlice";
import {
  PersonalState,
  setPersonalFromSync,
} from "../redux/slices/personalSlice";
import {
  UserSettingsState,
  setUserSettingsFromSync,
} from "../redux/slices/userSettingsSlice";
import {
  ProjectsState,
  setProjectsFromSync,
} from "../redux/slices/projectsSlice";
import {
  ArtifactsState,
  setArtifactsFromSync,
} from "../redux/slices/artifactsSlice";
import { ApiChatMessage } from "../model/ChatRequest";

const DEBOUNCE_DELAY = 2000; // 2 seconds
const MAX_DEBOUNCE_WAIT = 10000; // 10 seconds max wait

/**
 * SyncService handles encrypted data synchronization between client and server
 * Uses singleton pattern and provides debounced push functionality
 */
export class SyncService {
  private static instance: SyncService;
  private userId: string | null = null;
  private isInitialized = false;
  private pushTimeout: NodeJS.Timeout | number | null = null;
  private firstPushRequestTime: number | null = null;
  private lastRemoteVersion: number = 0;
  private isPushInProgress = false;
  private isSyncInProgress = false;
  private pendingPushAfterSync = false;

  private constructor() {}

  static getInstance(): SyncService {
    if (!SyncService.instance) {
      SyncService.instance = new SyncService();
    }
    return SyncService.instance;
  }

  /**
   * Initialize the sync service with user credentials
   */
  async initialize(userId: string, password: string): Promise<void> {
    this.userId = userId;
    await CryptoService.deriveKey(userId, password);
    this.isInitialized = true;
    console.log("[SyncService] Initialized for user:", userId);
  }

  /**
   * Clear state on logout
   */
  clear(): void {
    this.userId = null;
    this.isInitialized = false;
    CryptoService.clearKey();
    if (this.pushTimeout) {
      clearTimeout(this.pushTimeout);
      this.pushTimeout = null;
    }
    this.firstPushRequestTime = null;
    this.lastRemoteVersion = 0;
    this.isPushInProgress = false;
    this.isSyncInProgress = false;
    this.pendingPushAfterSync = false;
  }

  /**
   * Check if service is ready to sync
   */
  isReady(): boolean {
    return this.isInitialized && CryptoService.isInitialized();
  }

  /**
   * Convert ApiChatMessage to SyncableMessage
   * Ensures all messages have IDs and timestamps for proper sync
   *
   * Note on legacy ID generation: Messages without IDs get a deterministic ID
   * based on content hash to ensure stability across syncs. Using index alone
   * would cause issues if message order changes.
   */
  private toSyncableMessage(
    msg: ApiChatMessage,
    index: number
  ): SyncableMessage {
    const timestamp =
      typeof msg.timestamp === "number"
        ? msg.timestamp
        : msg.timestamp instanceof Date
        ? msg.timestamp.getTime()
        : 0;

    // Generate a stable ID for legacy messages based on content, not index
    // This prevents duplicate messages when order changes
    const legacyId =
      msg.id || this.generateLegacyMessageId(msg, timestamp, index);

    return {
      ...msg,
      id: legacyId,
      timestamp,
    };
  }

  /**
   * Generate a stable ID for legacy messages without IDs
   * Uses content + role + approximate timestamp to create deterministic ID
   */
  private generateLegacyMessageId(
    msg: ApiChatMessage,
    timestamp: number,
    fallbackIndex: number
  ): string {
    // Create a simple hash from message content for stability
    const content = msg.content || "";
    const role = msg.role || "unknown";

    // Use first 50 chars of content + role + timestamp bucket (round to nearest minute)
    // This creates a reasonably stable ID even if exact timestamp varies slightly
    const contentSnippet = content
      .substring(0, 50)
      .replace(/[^a-zA-Z0-9]/g, "");
    const timestampBucket =
      timestamp > 0 ? Math.floor(timestamp / 60000) : fallbackIndex;

    return `legacy-${role}-${timestampBucket}-${contentSnippet.substring(
      0,
      20
    )}`;
  }

  /**
   * Get local state as SyncPayload
   *
   * IMPORTANT: For timestamps, we use 0 as fallback instead of Date.now().
   * This ensures that data without timestamps (new/unmodified) will NOT
   * override remote data that has actual timestamps. This allows proper
   * LWW (Last-Writer-Wins) merging where remote data with real timestamps wins.
   */
  private getLocalPayload(): SyncPayload {
    const state = store.getState();
    const chatsState = state.chats as ChatsState;
    const personalState = state.personal as PersonalState;
    const userSettingsState = state.userSettings as
      | UserSettingsState
      | undefined;
    const projectsState = state.projects as ProjectsState | undefined;
    const artifactsState = state.artifacts as ArtifactsState | undefined;

    // Convert chats to syncable format
    // Use 0 as fallback to let remote data win if local has no timestamp
    const syncableChats: Record<string, SyncableChat> = {};
    for (const [id, chat] of Object.entries(chatsState.chats)) {
      // Convert messages to syncable format with IDs
      const syncableMessages = chat.messages.map((msg, idx) =>
        this.toSyncableMessage(msg, idx)
      );

      syncableChats[id] = {
        ...chat,
        messages: syncableMessages,
        updatedAt: chat.last_update || 0,
      };
    }

    // Get personal data
    // Use 0 as fallback to let remote data win if local has no timestamp
    const syncablePersonal: SyncablePersonal = {
      data: personalState.data,
      persona: personalState.persona,
      updatedAt: personalState.updatedAt || 0,
    };

    // Get user settings from userSettingsSlice
    // Use 0 as fallback to let remote data win if local has no timestamp
    const syncableUserSettings: SyncableUserSettings = {
      model: userSettingsState?.model || "",
      humanPrompt: userSettingsState?.humanPrompt ?? true,
      keepGoing: userSettingsState?.keepGoing ?? true,
      outsideBox: userSettingsState?.outsideBox ?? true,
      holisticTherapist: userSettingsState?.holisticTherapist ?? true,
      communicationStyle: userSettingsState?.communicationStyle || 0,
      assistant_name: userSettingsState?.assistant_name || "ToGODer",
      language: userSettingsState?.language || "",
      libraryIntegrationEnabled:
        userSettingsState?.libraryIntegrationEnabled ?? false,
      updatedAt: userSettingsState?.updatedAt || 0,
    };

    // Convert projects to syncable format
    const syncableProjects: Record<string, SyncableProject> = {};
    if (projectsState?.projects) {
      for (const [id, project] of Object.entries(projectsState.projects)) {
        syncableProjects[id] = {
          ...project,
        };
      }
    }

    // Convert artifacts to syncable format
    const syncableArtifacts: Record<string, SyncableArtifact> = {};
    if (artifactsState?.artifacts) {
      for (const [id, artifact] of Object.entries(artifactsState.artifacts)) {
        syncableArtifacts[id] = {
          ...artifact,
        };
      }
    }

    return {
      version: SYNC_VERSION,
      syncedAt: Date.now(),
      chats: syncableChats,
      personal: syncablePersonal,
      userSettings: syncableUserSettings,
      projects: syncableProjects,
      artifacts: syncableArtifacts,
    };
  }

  /**
   * Apply merged payload to Redux store
   */
  private applyPayloadToStore(payload: SyncPayload): void {
    console.log("[SyncService] applyPayloadToStore - Starting");

    // Apply chats - convert SyncableChat back to Chat format
    const chatsForStore: Record<
      string,
      Omit<SyncableChat, "updatedAt"> & { last_update: number }
    > = {};
    for (const [id, chat] of Object.entries(payload.chats)) {
      const { updatedAt, ...chatData } = chat;
      chatsForStore[id] = {
        ...chatData,
        last_update: updatedAt,
      };
      console.log(
        `[SyncService] applyPayloadToStore - Chat ${id}: messages=${
          chat.messages?.length || 0
        }, title="${chat.title || ""}", last_update=${updatedAt}`
      );
    }
    console.log(
      `[SyncService] applyPayloadToStore - Dispatching ${
        Object.keys(chatsForStore).length
      } chats to store`
    );
    store.dispatch(setChatsFromSync(chatsForStore));

    // Apply personal data
    console.log(
      `[SyncService] applyPayloadToStore - Personal data updatedAt: ${payload.personal.updatedAt}`
    );
    store.dispatch(
      setPersonalFromSync({
        data: payload.personal.data,
        persona: payload.personal.persona,
        updatedAt: payload.personal.updatedAt,
      })
    );

    // Apply user settings
    const { updatedAt, ...settingsData } = payload.userSettings;
    console.log(
      `[SyncService] applyPayloadToStore - User settings updatedAt: ${updatedAt}`
    );
    store.dispatch(
      setUserSettingsFromSync({
        ...settingsData,
        updatedAt,
      })
    );

    // Apply projects
    if (payload.projects) {
      console.log(
        `[SyncService] applyPayloadToStore - Projects count: ${
          Object.keys(payload.projects).length
        }`
      );
      store.dispatch(setProjectsFromSync(payload.projects));
    }

    // Apply artifacts
    if (payload.artifacts) {
      console.log(
        `[SyncService] applyPayloadToStore - Artifacts count: ${
          Object.keys(payload.artifacts).length
        }`
      );
      store.dispatch(setArtifactsFromSync(payload.artifacts));
    }

    console.log("[SyncService] applyPayloadToStore - Complete");
  }

  /**
   * Pull remote data, merge with local, and apply to store
   * Protected against concurrent sync operations
   */
  async pullAndMerge(): Promise<void> {
    if (!this.isReady()) {
      console.warn("[SyncService] Not initialized, skipping pull");
      return;
    }

    // Prevent concurrent sync operations
    if (this.isSyncInProgress) {
      console.log("[SyncService] Sync already in progress, skipping");
      return;
    }

    this.isSyncInProgress = true;
    try {
      console.log("[SyncService] Starting pullAndMerge");
      const response = await SyncApiClient.pull();

      if (!response) {
        // No remote data (404), push local data
        console.log("[SyncService] No remote sync data, pushing local data");
        await this.push();
        return;
      }

      this.lastRemoteVersion = response.version;
      console.log(
        "[SyncService] Remote version:",
        response.version,
        "lastModified:",
        response.lastModified
      );

      // Decrypt remote data
      const decryptedJson = await CryptoService.decrypt(response.encryptedData);
      const remotePayload: SyncPayload = JSON.parse(decryptedJson);
      console.log(
        "[SyncService] Remote payload - chats:",
        Object.keys(remotePayload.chats).length,
        "chatIds:",
        Object.keys(remotePayload.chats)
      );

      // Get local payload
      const localPayload = this.getLocalPayload();
      console.log(
        "[SyncService] Local payload - chats:",
        Object.keys(localPayload.chats).length,
        "chatIds:",
        Object.keys(localPayload.chats)
      );

      // Log some timestamps for debugging
      for (const [id, chat] of Object.entries(localPayload.chats)) {
        const remoteChat = remotePayload.chats[id];
        if (remoteChat) {
          console.log(
            `[SyncService] Chat ${id} - local.updatedAt: ${chat.updatedAt}, remote.updatedAt: ${remoteChat.updatedAt}`
          );
        } else {
          console.log(
            `[SyncService] Chat ${id} only exists locally, updatedAt: ${chat.updatedAt}`
          );
        }
      }
      for (const [id, chat] of Object.entries(remotePayload.chats)) {
        if (!localPayload.chats[id]) {
          console.log(
            `[SyncService] Chat ${id} only exists remotely, updatedAt: ${chat.updatedAt}`
          );
        }
      }

      // Merge using LWW strategy
      const mergedPayload = mergeSyncPayloads(localPayload, remotePayload);
      console.log(
        "[SyncService] Merged payload - chats:",
        Object.keys(mergedPayload.chats).length,
        "chatIds:",
        Object.keys(mergedPayload.chats)
      );

      // Apply merged data to store
      console.log("[SyncService] Applying merged payload to store...");
      this.applyPayloadToStore(mergedPayload);
      console.log("[SyncService] Merged payload applied to store");

      // If local had newer changes, push the merged result
      const remoteTimestamp = new Date(response.lastModified).getTime();
      console.log(
        "[SyncService] Checking hasLocalChanges - remoteTimestamp:",
        remoteTimestamp
      );
      if (hasLocalChanges(localPayload, remoteTimestamp)) {
        console.log(
          "[SyncService] Local has newer changes, pushing merged result..."
        );
        await this.push();
      } else {
        console.log(
          "[SyncService] No local changes newer than remote, skipping push"
        );
      }

      console.log("[SyncService] Sync pull and merge completed successfully");
    } catch (error) {
      console.error("[SyncService] Sync pull failed:", error);
      throw error;
    } finally {
      this.isSyncInProgress = false;

      // If there were push requests during sync, execute them now
      if (this.pendingPushAfterSync) {
        this.pendingPushAfterSync = false;
        console.log(
          "[SyncService] Executing pending push after sync completed"
        );
        this.queuePush();
      }
    }
  }

  /**
   * Push local data to server
   * Protected against concurrent execution
   */
  private async push(): Promise<void> {
    if (!this.isReady()) {
      console.warn("[SyncService] Not initialized, skipping push");
      return;
    }

    // Prevent concurrent pushes
    if (this.isPushInProgress) {
      console.log("[SyncService] Push already in progress, skipping");
      return;
    }

    this.isPushInProgress = true;
    try {
      const localPayload = this.getLocalPayload();
      const jsonData = JSON.stringify(localPayload);
      const encryptedData = await CryptoService.encrypt(jsonData);

      const response = await SyncApiClient.push(
        encryptedData,
        this.lastRemoteVersion > 0 ? this.lastRemoteVersion : undefined
      );
      this.lastRemoteVersion = response.version;

      console.log("[SyncService] Push completed, version:", response.version);
    } catch (error) {
      console.error("[SyncService] Push failed:", error);
      throw error;
    } finally {
      this.isPushInProgress = false;
    }
  }

  /**
   * Queue a push with debouncing
   * Waits 2s after last change, but max 10s total wait time
   *
   * If a sync operation is in progress, marks a pending push to execute after sync completes.
   * If a push is already in progress, the timeout will still fire and retry.
   */
  queuePush(): void {
    if (!this.isReady()) {
      return;
    }

    // If sync is in progress, defer push until sync completes
    // This prevents pushing stale data during a merge operation
    if (this.isSyncInProgress) {
      console.log("[SyncService] Sync in progress, deferring push");
      this.pendingPushAfterSync = true;
      return;
    }

    const now = Date.now();

    // Track first request time for max wait
    if (!this.firstPushRequestTime) {
      this.firstPushRequestTime = now;
    }

    // Clear existing timeout
    if (this.pushTimeout) {
      clearTimeout(this.pushTimeout);
    }

    // Check if we've exceeded max wait time
    const timeSinceFirstRequest = now - this.firstPushRequestTime;
    if (timeSinceFirstRequest >= MAX_DEBOUNCE_WAIT) {
      // Execute immediately
      this.firstPushRequestTime = null;
      this.executePush();
      return;
    }

    // Calculate delay (remaining time until max wait, capped at DEBOUNCE_DELAY)
    const remainingMaxWait = MAX_DEBOUNCE_WAIT - timeSinceFirstRequest;
    const delay = Math.min(DEBOUNCE_DELAY, remainingMaxWait);

    this.pushTimeout = setTimeout(() => {
      this.firstPushRequestTime = null;
      this.pushTimeout = null;
      this.executePush();
    }, delay);
  }

  /**
   * Execute a push, handling the case where one is already in progress
   */
  private executePush(): void {
    // If a push is already running, queue another push attempt
    // This ensures changes made during a push aren't lost
    if (this.isPushInProgress) {
      console.log("[SyncService] Push in progress, re-queueing");
      // Reset first request time so the new queue doesn't immediately fire
      this.firstPushRequestTime = null;
      // Schedule a new push after a short delay
      setTimeout(() => this.queuePush(), DEBOUNCE_DELAY);
      return;
    }

    this.push().catch((error) => {
      console.error(
        "[SyncService] Push failed, will retry on next change:",
        error
      );
      // Don't re-queue automatically on error to prevent infinite loops
      // The next state change will trigger a new push attempt
    });
  }

  /**
   * Handle password change - re-encrypt remote data with new password
   */
  async handlePasswordChange(
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    if (!this.userId) {
      throw new Error("SyncService not initialized");
    }

    try {
      // Fetch current remote data
      const response = await SyncApiClient.pull();

      if (response) {
        // Re-encrypt with new password
        const reEncryptedData = await CryptoService.reEncrypt(
          response.encryptedData,
          this.userId,
          oldPassword,
          newPassword
        );

        // Push re-encrypted data and update version tracking
        const pushResponse = await SyncApiClient.push(
          reEncryptedData,
          response.version
        );
        this.lastRemoteVersion = pushResponse.version;
      }

      // Update service with new password
      await this.initialize(this.userId, newPassword);

      console.log("[SyncService] Password change handled, data re-encrypted");
    } catch (error) {
      console.error("[SyncService] Failed to handle password change:", error);
      throw error;
    }
  }
}
