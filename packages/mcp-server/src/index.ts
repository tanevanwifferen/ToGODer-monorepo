import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { appConfig } from "./config.js";
import { AuthService } from "./auth/authService.js";
import { ChatService } from "./chat/chatService.js";

const authService = new AuthService();
const chatService = new ChatService();

let defaultSession: Awaited<ReturnType<typeof bootstrapDefaultSession>> = null;

const sendMessageSchema = z.object({
  message: z.string().min(1, "message is required"),
});

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
};

function toToolResult(payload: unknown): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

async function bootstrapDefaultSession() {
  try {
    const session = await authService.login(
      appConfig.credentials.username,
      appConfig.credentials.password
    );
    chatService.ensureSession(session.userId);
    // eslint-disable-next-line no-console
    console.error("ToGODer session established for user:", session.userId);
    return session;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(
      "Failed to establish initial ToGODer session:",
      (error as Error).message
    );
    return null;
  }
}

async function main() {
  const server = new Server(
    {
      name: "togoder-mcp-server",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Set up request handlers before connecting
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "get_chat_history",
        description:
          "Fetch the in-memory chat history for the current session.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "send_chat_message",
        description: "Send a message to ToGODer and receive a response.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "The message to send to ToGODer",
            },
          },
          required: ["message"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (!defaultSession) {
      throw new Error("No active session. Server initialization failed.");
    }

    const { name, arguments: args } = request.params;
    const userId = defaultSession.userId;

    switch (name) {
      case "get_chat_history": {
        chatService.ensureSession(userId);

        return toToolResult({
          history: chatService.getHistory(userId),
        });
      }

      case "send_chat_message": {
        const { message } = sendMessageSchema.parse(args);

        chatService.ensureSession(userId);
        chatService.appendUserMessage(userId, message);

        try {
          // Call the ToGODer API with the message and chat history
          const assistantReply = await chatService.sendMessage(
            userId,
            message,
            defaultSession.remoteToken
          );

          chatService.appendAssistantMessage(userId, assistantReply);

          return toToolResult({
            reply: assistantReply,
            history: chatService.getHistory(userId),
          });
        } catch (error) {
          // If the API call fails, append an error message
          const errorMessage = `Error: ${(error as Error).message}`;
          chatService.appendAssistantMessage(userId, errorMessage);

          return toToolResult({
            reply: errorMessage,
            history: chatService.getHistory(userId),
            error: true,
          });
        }
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  });

  // Bootstrap session after handlers are set up but before connecting
  defaultSession = await bootstrapDefaultSession();

  if (!defaultSession) {
    throw new Error(
      "Failed to establish ToGODer session. Check your credentials in .env file."
    );
  }

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Fatal MCP server error:", error);
  process.exit(1);
});
