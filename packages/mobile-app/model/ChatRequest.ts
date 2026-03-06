export enum ChatRequestCommunicationStyle {
  Default = 0,
  LessBloat = 1,
  AdaptToConversant = 2,
  Informal = 3,
}

export interface ApiChatMessage {
  id?: string; // Unique ID for sync tracking
  content: string;
  role: "user" | "assistant" | "tool";
  signature?: string;
  timestamp?: Date | number;
  updateData?: string;
  hidden?: boolean;
  artifactId?: string;
  tool_call_id?: string;
  deleted?: boolean; // Tombstone marker for sync
  deletedAt?: number; // When the message was deleted
}

export interface ChatSettings {
  model: string;
  humanPrompt: boolean | undefined;
  keepGoing: boolean | undefined;
  outsideBox: boolean | undefined;
  holisticTherapist: boolean | undefined;
  communicationStyle: ChatRequestCommunicationStyle | undefined;
  assistant_name: string | undefined;
  language: string | undefined;
  libraryIntegrationEnabled: boolean | undefined;
  customSystemPrompt?: string;
  persona?: string;
}

export interface ArtifactIndexItem {
  path: string;
  name: string;
  mimeType?: string;
  type: "file" | "folder";
}

export interface ToolSchema {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<
        string,
        {
          type: string;
          description: string;
        }
      >;
      required: string[];
    };
  };
}

export interface ChatRequest extends ChatSettings {
  prompts: ApiChatMessage[];
  memoryLoopCount?: number;
  memoryLoopLimitReached?: boolean;
  artifactIndex?: ArtifactIndexItem[];
  tools?: ToolSchema[];
}

export interface ExperienceRequest {
  model: string;
  language: string;
  assistant_name: string | undefined;
}
