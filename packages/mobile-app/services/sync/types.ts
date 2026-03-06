import { ApiChatMessage, ChatSettings } from "../../model/ChatRequest";

/**
 * Sync payload types for encrypted data synchronization
 *
 * Sync Strategy:
 * - Chats, messages, projects, and artifacts use tombstones (deleted + deletedAt) for proper deletion handling
 * - Messages have unique IDs for message-level merging
 * - Last-Writer-Wins (LWW) based on timestamps at item level
 */

export interface SyncableMessage extends ApiChatMessage {
  id: string; // Required for sync
  timestamp: number; // Required for LWW
}

export interface SyncableChat {
  id: string;
  title?: string | null;
  messages: SyncableMessage[];
  isRequest: boolean;
  last_update?: number;
  memories: string[];
  draftInputText?: string;
  projectId?: string;
  updatedAt: number;
  deleted?: boolean; // Tombstone: chat was deleted
  deletedAt?: number; // When the chat was deleted
}

export interface SyncablePersonal {
  data: any;
  persona: string;
  updatedAt: number;
}

export interface SyncableUserSettings extends ChatSettings {
  updatedAt: number;
}

export interface SyncableProject {
  id: string;
  name: string;
  description?: string;
  chatIds: string[];
  createdAt: number;
  updatedAt: number;
  deleted?: boolean; // Tombstone: project was deleted
  deletedAt?: number; // When the project was deleted
}

export interface SyncableArtifact {
  id: string;
  projectId: string;
  name: string;
  type: "file" | "folder";
  parentId: string | null;
  content?: string;
  createdAt: number;
  updatedAt: number;
  deleted?: boolean; // Tombstone: artifact was deleted
  deletedAt?: number; // When the artifact was deleted
}

export interface SyncPayload {
  version: number;
  syncedAt: number;
  chats: Record<string, SyncableChat>;
  personal: SyncablePersonal;
  userSettings: SyncableUserSettings;
  projects: Record<string, SyncableProject>;
  artifacts: Record<string, SyncableArtifact>;
}

/**
 * Internal encrypted data structure (iv + ciphertext + tag)
 * Used internally by CryptoService before combining into single blob
 */
export interface EncryptedParts {
  iv: string;
  ciphertext: string;
  tag: string;
}

/**
 * API response from GET /api/sync
 */
export interface SyncPullResponse {
  encryptedData: string;
  version: number;
  lastModified: string;
}

/**
 * API request for POST /api/sync
 */
export interface SyncPushRequest {
  encryptedData: string;
  version?: number;
}

/**
 * API response from POST /api/sync
 */
export interface SyncPushResponse {
  success: boolean;
  version: number;
  lastModified: string;
}

export const SYNC_VERSION = 1;

/**
 * Interface for CryptoService implementations
 * Implemented by platform-specific services (iOS, Android, Web)
 */
export interface ICryptoService {
  /**
   * Derive encryption key from password using PBKDF2
   * Salt is based on userId for deterministic key derivation
   */
  deriveKey(userId: string, password: string): Promise<void>;

  /**
   * Clear the encryption key (e.g., on logout)
   */
  clearKey(): void;

  /**
   * Check if the service is initialized with a key
   */
  isInitialized(): boolean;

  /**
   * Encrypt data using AES-256-GCM
   * Returns a single base64 blob: [IV][ciphertext][tag]
   */
  encrypt(data: string): Promise<string>;

  /**
   * Decrypt data using AES-256-GCM
   * Expects a single base64 blob: [IV][ciphertext][tag]
   */
  decrypt(encryptedBlob: string): Promise<string>;

  /**
   * Re-encrypt data with a new password
   * Used when user changes their password
   */
  reEncrypt(
    encryptedBlob: string,
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<string>;
}
