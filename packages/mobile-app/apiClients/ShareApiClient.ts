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
}