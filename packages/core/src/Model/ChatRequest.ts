import { ChatCompletionMessageParam, ChatCompletionTool } from "openai/resources";
import { AIProvider } from "../LLM/Model/AIProvider";
import { PendingMemoryOp } from "../Tools/MemoryTool";

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
   * Client-derived AES-256-GCM key (base64) for a persisted encrypted PDF
   * upload. The client derives this from a per-user secret + the document
   * title (never stored server-side); the server only keeps the ciphertext
   * and decrypts transiently at send time using this key. Lets a PDF persist
   * across messages without re-upload. Stripped for anonymous users.
   */
  pdfKey?: string;
  /**
   * Client's RSA public key (PEM) for asymmetric image encryption.
   * When present, the image_generate tool encrypts generated images using
   * hybrid RSA+AES-256-GCM so only the client (holding the private key)
   * can decrypt them. The server never sees the private key and cannot
   * decrypt stored images. Omit for symmetric fallback (logged-out users).
   */
  imagePublicKey?: string;
  /**
   * Server-side only: compact emotional-analysis block injected (hidden)
   * into the LLM's copy of the latest user message. Never sent by clients;
   * set by the chat pipeline after SentimentService runs.
   */
  sentimentContext?: string;
  /**
   * When true, the conversation is ephemeral: not saved to chat history,
   * not persisted to memory, and leaves no trace after the session ends.
   */
  incognito?: boolean;
  /**
   * Server-side only: pending client-side memory operations queued by
   * conscious memory tools (write_memory, delete_memory). Drained by
   * StreamingChatService after each backend tool execution.
   */
  _pendingMemoryOps?: PendingMemoryOp[];
  /**
   * Server-side only: pending wake-up intents queued by the
   * schedule_wakeup tool. Drained by StreamingChatService after each
   * backend tool execution and persisted to the database.
   */
  _pendingWakeup?: Array<{ triggerAt: Date; reason: string }>;
  /**
   * Server-side only: the authenticated user ID, set by the streaming
   * service so tool handlers can access server-side persistence.
   */
  _userId?: string;
  /**
   * Server-side only: the system prompt built for this request.
   * Set by the streaming service so the read_system_prompt introspection
   * tool can return it to the AI for self-awareness.
   */
  _systemPrompt?: string;
}

export interface ExperienceRequest {
  model: AIProvider;
  language: string;
  assistant_name: string | undefined;
  data?: any;
}
