/**
 * API client for handling shared conversation operations.
 * Uses the base ApiClient for making authenticated requests to the sharing endpoints.
 */

import { ApiClient } from './ApiClient';
import {
  ShareRequest,
  ShareArtifactRequest,
  SharedArtifact,
  SharedConversation,
  SharedFolder,
  ShareFolderRequest,
  ListSharedConversationsResponse,
} from '../model/ShareTypes';

export class ShareApiClient {
  /**
   * Creates a new shared conversation.
   * Requires authentication and verifies message signatures.
   */
  static async shareConversation(request: ShareRequest): Promise<SharedConversation> {
    return ApiClient.post<SharedConversation>('/share', request);
  }

  /**
   * Lists shared conversations with pagination.
   * Public endpoint that doesn't require authentication.
   */
  static async listSharedConversations(
    page: number = 1,
    limit: number = 50
  ): Promise<ListSharedConversationsResponse> {
    return ApiClient.get<ListSharedConversationsResponse>(
      `/share?page=${page}&limit=${limit}`
    );
  }

  /**
   * Retrieves a specific shared conversation by ID.
   * Public endpoint that doesn't require authentication.
   */
  static async getSharedConversation(id: string): Promise<SharedConversation> {
    return ApiClient.get<SharedConversation>(`/share/${id}`);
  }

  /**
   * Copies a shared conversation to create a new chat.
   * Requires authentication.
   */
  static async copySharedConversation(id: string): Promise<{ chatId: string }> {
    return ApiClient.post<{ chatId: string }>(`/share/${id}/copy`);
  }

  /**
   * Deletes a shared conversation.
   * Requires authentication and ownership of the shared conversation.
   */
  static async deleteSharedConversation(id: string): Promise<void> {
    return ApiClient.delete(`/share/${id}`);
  }

  /**
   * Creates a new shared artifact.
   * Requires authentication; instruction snapshots are verified server-side.
   */
  static async shareArtifact(
    request: ShareArtifactRequest
  ): Promise<SharedArtifact> {
    return ApiClient.post<SharedArtifact>('/share/artifact', request);
  }

  /**
   * Retrieves a specific shared artifact by ID.
   * Public endpoint that doesn't require authentication.
   */
  static async getSharedArtifact(id: string): Promise<SharedArtifact> {
    return ApiClient.get<SharedArtifact>(`/share/artifact/${id}`);
  }

  /**
   * Deletes a shared artifact.
   * Requires authentication and ownership of the shared artifact.
   */
  static async deleteSharedArtifact(id: string): Promise<void> {
    return ApiClient.delete(`/share/artifact/${id}`);
  }

  /**
   * Generates a server-issued HMAC signature for artifact content.
   * This proves the artifact is AI-generated, not hand-authored.
   * Required before calling shareArtifact.
   */
  static async signArtifact(
    title: string,
    content: string,
  ): Promise<{ signature: string }> {
    return ApiClient.post<{ signature: string }>('/share/artifact/sign', {
      title,
      content,
    });
  }

  // ── Folder sharing ──────────────────────────────────────────────

  /**
   * Creates a new shared folder containing artifacts.
   * Requires authentication.
   */
  static async shareFolder(
    request: ShareFolderRequest,
  ): Promise<SharedFolder> {
    return ApiClient.post<SharedFolder>('/share/folder', request);
  }

  /**
   * Retrieves a specific shared folder by ID.
   * Public endpoint.
   */
  static async getSharedFolder(id: string): Promise<SharedFolder> {
    return ApiClient.get<SharedFolder>(`/share/folder/${id}`);
  }

  /**
   * Deletes a shared folder. Owner only.
   */
  static async deleteSharedFolder(id: string): Promise<void> {
    return ApiClient.delete(`/share/folder/${id}`);
  }

  // ── Admin Payload publishing ────────────────────────────────────

  /**
   * Marks a shared chat as published to Payload (admin only).
   */
  static async markChatAsPayload(id: string): Promise<void> {
    return ApiClient.post(`/admin/payload/chat/${id}/mark`);
  }

  /**
   * Marks a shared artifact as published to Payload (admin only).
   */
  static async markArtifactAsPayload(id: string): Promise<void> {
    return ApiClient.post(`/admin/payload/artifact/${id}/mark`);
  }

  /**
   * Marks a shared folder as published to Payload (admin only).
   */
  static async markFolderAsPayload(id: string): Promise<void> {
    return ApiClient.post(`/admin/payload/folder/${id}/mark`);
  }
}