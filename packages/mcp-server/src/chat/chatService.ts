import type { ChatMessage, ChatSession } from "../types.js";
import { generateId } from "../utils/id.js";
import { request } from "undici";
import { appConfig } from "../config.js";

export class ChatService {
  private readonly sessions = new Map<string, ChatSession>();
  private readonly baseUrl = appConfig.remoteApi.baseUrl.replace(/\/+$/, "");
  private readonly model = appConfig.chat.model;

  ensureSession(userId: string): ChatSession {
    if (!this.sessions.has(userId)) {
      this.sessions.set(
        userId,
        this.createSession(userId, "New ToGODer chat session started.")
      );
    }

    return this.sessions.get(userId)!;
  }

  getSession(userId: string): ChatSession {
    let session = this.sessions.get(userId);

    if (!session) {
      session = this.createSession(userId);
      this.sessions.set(userId, session);
    }

    return session;
  }

  appendUserMessage(userId: string, content: string): ChatSession {
    const session = this.getSession(userId);
    const message: ChatMessage = {
      id: generateId("msg"),
      role: "user",
      content,
      createdAt: new Date(),
    };

    session.messages.push(message);
    return session;
  }

  appendAssistantMessage(userId: string, content: string): ChatSession {
    const session = this.getSession(userId);
    const message: ChatMessage = {
      id: generateId("msg"),
      role: "assistant",
      content,
      createdAt: new Date(),
    };

    session.messages.push(message);
    return session;
  }

  getHistory(userId: string): ChatMessage[] {
    return [...this.getSession(userId).messages];
  }

  /**
   * Send a chat message to the ToGODer API and get a response
   */
  async sendMessage(
    userId: string,
    message: string,
    authToken: string
  ): Promise<string> {
    const session = this.getSession(userId);

    // Convert chat history to API format
    const prompts = session.messages
      .filter((msg) => msg.role !== "system")
      .map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

    // Add the new user message
    prompts.push({
      role: "user",
      content: message,
    });

    // Prepare the request body
    const requestBody = {
      model: this.model,
      humanPrompt: false,
      keepGoing: false,
      outsideBox: false,
      holisticTherapist: false,
      communicationStyle: "default",
      prompts: prompts,
      memories: {},
      memoryIndex: [],
      assistant_name: "ToGODer",
      libraryIntegrationEnabled: false,
    };

    // Make the API request
    // Allow up to 10 minutes for the remote ToGODer chat call so heavy
    // requests (long-running model generation) are not cut off early.
    // undici's defaults are 5 minutes, which is too short.
    const response = await request(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headersTimeout: 10 * 60 * 1000,
      bodyTimeout: 10 * 60 * 1000,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (response.statusCode !== 200) {
      const errorText = await response.body.text();
      throw new Error(
        `ToGODer API error: ${errorText || `status ${response.statusCode}`}`
      );
    }

    const data = (await response.body.json()) as any;

    // Handle memory request response
    if (data.requestForMemory) {
      throw new Error("Memory request not supported in MCP server yet");
    }

    return data.content || "No response from ToGODer";
  }

  private createSession(userId: string, systemMessage?: string): ChatSession {
    const messages: ChatMessage[] = [];

    if (systemMessage) {
      messages.push({
        id: generateId("msg"),
        role: "system",
        content: systemMessage,
        createdAt: new Date(),
      });
    }

    return {
      id: generateId("session"),
      userId,
      messages,
    };
  }
}
