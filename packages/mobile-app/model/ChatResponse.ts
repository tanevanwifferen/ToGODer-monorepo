export type ChatResponse = MemoryRequestResponse | MessageResponse;

export interface UpdateMemoryResponse {
  updateData: string;
}

export interface MemoryRequestResponse {
  requestForMemory: string[];
}

export interface MessageResponse{
  content: string;
  signature?: string;
  updateData?: string;
  // Server-signed snapshot of the custom instructions used for this response
  instructionsSnapshot?: {
    content: string;
    timestamp: number;
    signature: string;
  };
}

export interface TitleResponse {
  content: string;
}

export interface ExperienceResponse {
  content: string;
}

export interface SystemPromptResponse {
  systemPrompt: string | null;
  requestForMemory: { keys: string[] } | null;
  assistant_name?: string;
}