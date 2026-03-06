export type ChatRole = "user" | "assistant" | "system";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: Date;
}

export interface ChatSession {
  id: string;
  userId: string;
  messages: ChatMessage[];
}

export interface AuthTokens {
  sessionToken: string;
  remoteToken: string;
  remoteTokenExpiresAt: number;
  userId: string;
}

export interface AuthenticatedContext {
  session: AuthTokens;
  tokensUpdated: boolean;
}
