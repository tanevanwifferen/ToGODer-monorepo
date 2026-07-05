/**
 * Types for the sharing conversations feature.
 * Defines the shape of shared conversation data and API request/response types.
 */

// Base message type for shared conversations
export interface SharedMessage {
  role: "user" | "assistant" | "tool";
  content: string;
}

// Message with signature for verification
export interface SignedMessage {
  message: SharedMessage;
  signature: string;
}

// Server-signed snapshot of the custom instructions active at a point in time.
// Signature covers content + timestamp, so instruction changes are verifiable.
export interface SignedInstructionSnapshot {
  content: string;
  timestamp: number;
  signature: string;
}

// Request body for sharing a conversation
export type ShareVisibility = "PUBLIC" | "PRIVATE";

export interface ShareRequest {
  messages: SignedMessage[];
  title: string;
  description?: string;
  visibility: ShareVisibility;
  instructionHistory?: SignedInstructionSnapshot[];
}

// Request body for sharing an artifact
export interface ShareArtifactRequest {
  title: string;
  description?: string;
  content: string;
  visibility: ShareVisibility;
  instructionHistory?: SignedInstructionSnapshot[];
}

// Full shared artifact data
export interface SharedArtifact {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  content: string;
  createdAt: string;
  views: number;
  visibility: ShareVisibility;
  instructionHistory?: string; // JSON string of SignedInstructionSnapshot[]
}

// Owner information in shared conversations
export interface SharedConversationOwner {
  id: string;
  email: string;
}

// Full shared conversation data
export interface SharedConversation {
  id: string;
  ownerId: string;
  title: string;
  description?: string;
  createdAt: string;
  messages: string; // JSON string of SignedMessage[]
  views: number;
  owner: SharedConversationOwner;
  visibility: ShareVisibility;
  instructionHistory?: string; // JSON string of SignedInstructionSnapshot[]
}

// Parse a JSON instructionHistory blob defensively.
export function parseInstructionHistory(
  raw: string | undefined | null
): SignedInstructionSnapshot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Response for listing shared conversations
export interface ListSharedConversationsResponse {
  chats: SharedConversation[];
  total: number;
}

// Type for infinite query data structure
export interface InfiniteSharedConversationsResponse {
  pages: ListSharedConversationsResponse[];
  pageParams: number[];
}
