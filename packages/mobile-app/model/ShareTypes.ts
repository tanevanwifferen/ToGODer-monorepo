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

// Request body for sharing a conversation
export type ShareVisibility = "PUBLIC" | "PRIVATE";

export interface ShareRequest {
  messages: SignedMessage[];
  title: string;
  description?: string;
  visibility: ShareVisibility;
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
