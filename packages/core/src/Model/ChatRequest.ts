import {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources";
import { AIProvider } from "../LLM/Model/AIProvider";

export enum ChatRequestCommunicationStyle {
  Default = 0,
  LessBloat = 1,
  AdaptToConversant = 2,
  Informal = 3,
}

export interface ArtifactInfo {
  path: string;
  name: string;
  mimeType: string;
  /**
   * Optional base64-encoded file content (no data-URI prefix). When present
   * for a PDF (mimeType `application/pdf`) and the selected model supports
   * document input, the backend sends the file as a native `file` content
   * part to the model instead of only listing it as readable text.
   */
  data?: string;
}

export interface ChatRequest {
  model: AIProvider;
  humanPrompt: boolean | undefined;
  keepGoing: boolean | undefined;
  outsideBox: boolean | undefined;
  holisticTherapist: boolean | undefined;
  communicationStyle: ChatRequestCommunicationStyle | undefined;
  prompts: ChatCompletionMessageParam[];
  assistant_name: string | undefined;
  configurableData?: any;
  staticData?: any;
  memoryIndex: string[];
  memories: Record<string, string>;
  customSystemPrompt?: string;
  persona?: string;
  libraryIntegrationEnabled?: boolean;
  memoryLoopCount?: number;
  memoryLoopLimitReached?: boolean;
  artifactIndex?: ArtifactInfo[];
  tools?: ChatCompletionTool[];
  /**
   * Out-of-band reference to an uploaded PDF. The client uploads the file
   * once (POST /api/chat/pdf) and receives an opaque id; only that id is
   * carried here so the message/conversation payload stays small. The
   * backend resolves the cached bytes at send time and injects native
   * `file` content parts for document-capable models. Never base64-embeds
   * the PDF into the conversation history.
   */
  pdfCacheId?: string;
  /**
   * Optional filename override for the cached PDF upload, shown to the user
   * and used as the `file_data` filename when sent to the model.
   */
  pdfName?: string;
  /**
   * Server-side only: compact emotional-analysis block injected (hidden)
   * into the LLM's copy of the latest user message. Never sent by clients;
   * set by the chat pipeline after SentimentService runs.
   */
  sentimentContext?: string;
}

export interface ExperienceRequest {
  model: AIProvider;
  language: string;
  assistant_name: string | undefined;
  data?: any;
}
