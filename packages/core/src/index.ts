import express, { NextFunction, Request, Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import path from "path";
import rateLimit from "express-rate-limit";
import { GetChatRouter } from "./Web/ChatController";
import { ConversationApi } from "./Api/ConversationApi";
import { GetAuthRouter } from "./Web/AuthController";
import {
  GetModelName,
  ListModels,
  modelSupportsDocuments,
} from "./LLM/Model/AIProvider";
import { fetchDocumentCapableModels } from "./LLM/Model/OpenRouterModels";
import { GetBillingRouter } from "./Web/BillingController";
import { setupKoFi } from "./Web/KoFiController";
import { setupRunners } from "./Auth/Runners";
import { GetShareRouter } from "./Web/ShareController";
import { GetMemoryRouter } from "./Web/MemoryController";
import { GetSyncRouter } from "./Web/SyncController";
import { GetSentimentRouter } from "./Web/SentimentController";
import { GetMcpRouter } from "./Web/McpController";
import { GetPdfUploadRouter } from "./Web/PdfUploadController";
import { GetImageRouter } from "./Web/ImageController";
import { sentimentIntegrationEnabled } from "./Services/SentimentService";
import {
  GetRealtimeVoiceRouter,
  setupRealtimeVoiceWebSocket,
} from "./Web/RealtimeVoiceController";
import { GetAdminRouter } from "./Web/AdminController";
import { GetTtsRouter } from "./Web/TtsController";
import { GetSttRouter } from "./Web/SttController";
import { GetReferralRouter } from "./Web/ReferralController";
import { createServer } from "http";
import WebSocket from "ws";
import { registerLibraryTool } from "./Tools/LibraryTool";
import { registerArxivTools } from "./Tools/ArxivTool";
import { registerMemoryTools } from "./Tools/MemoryTool";
import { registerMcpJobTool } from "./Tools/McpJobTool";
import { registerSystemPromptTool } from "./Tools/SystemPromptTool";
import { registerScheduleWakeupTool } from "./Tools/ScheduleWakeupTool";
import { registerImageGenerateTool } from "./Tools/ImageGenerateTool";
import { registerIntrospectionTools } from "./Tools/IntrospectionTool";
import { GetPushRouter } from "./Web/PushController";
import { getWakeupService } from "./Services/WakeupService";

const app = express();
const port = process.env.PORT || 3000;

// Trust the first proxy to allow the app to get the client's IP address
app.set("trust proxy", 1);

// Allow cross-origin requests from the production and beta frontends
const allowedOrigins = [
  "https://togoder.click",
  "https://www.togoder.click",
  "https://beta.togoder.click",
];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow non-browser requests (no Origin header) and same-origin requests
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
  }),
);

// Rate limiter to prevent abuse
const messageLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Shared across all endpoints — streaming + memory + sync + chat add up fast
  skipFailedRequests: true, // Don't penalise 401/402 responses
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req: Request, res: Response) => {
    res
      .status(429)
      .send("Too many messages sent from this IP, please try again later.");
  },
  headers: true,
});

app.use(express.json({ limit: "50mb" }));

app.use(cookieParser());

app.use(
  express.urlencoded({
    extended: true,
  }),
);

// Serve static files from the "../Frontend" directory
app.use(express.static(path.join(__dirname, "../Frontend")));

// controllers
const chatRouter = GetChatRouter(messageLimiter);
const authRouter = GetAuthRouter();
const billingRouter = GetBillingRouter(messageLimiter);
const memoryRouter = GetMemoryRouter(messageLimiter);
const shareRouter = GetShareRouter(messageLimiter);
const realtimeVoiceRouter = GetRealtimeVoiceRouter(messageLimiter);
const syncRouter = GetSyncRouter(messageLimiter);
const sentimentRouter = GetSentimentRouter(messageLimiter);
const mcpRouter = GetMcpRouter(messageLimiter);
const pdfUploadRouter = GetPdfUploadRouter();
const imageRouter = GetImageRouter();
const adminRouter = GetAdminRouter();
const ttsRouter = GetTtsRouter(messageLimiter);
const sttRouter = GetSttRouter(messageLimiter);
const referralRouter = GetReferralRouter();
const pushRouter = GetPushRouter(messageLimiter);

app.use(chatRouter);
app.use(authRouter);
app.use(billingRouter);
app.use(memoryRouter);
app.use(shareRouter);
app.use(realtimeVoiceRouter);
app.use(syncRouter);
app.use(sentimentRouter);
app.use(mcpRouter);
app.use(pdfUploadRouter);
app.use(imageRouter);
app.use(adminRouter);
app.use(ttsRouter);
app.use(sttRouter);
app.use(referralRouter);
app.use(pushRouter);

const donateOptions: { address: string }[] = JSON.parse(
  process.env.DONATE_OPTIONS || "[]",
);
if (donateOptions.filter((x) => x.address.includes("ko-fi.com")).length > 0) {
  setupKoFi(app);
}

app.get("/api/links", (req, res) => {
  res.json(JSON.parse(process.env.LINKS || "[]"));
});

app.get("/api/global_config", async (req, res) => {
  var donateOptions = JSON.parse(process.env.DONATE_OPTIONS || "[]");
  var showLogin = JSON.parse(process.env.SHOW_LOGIN || "false");
  var quote = new ConversationApi("").getQuote();
  // Discover document (PDF) capability dynamically from OpenRouter and attach
  // a per-model flag so the client model picker can gate PDF attachment.
  const documentCapable = await fetchDocumentCapableModels();
  var models = await Promise.all(
    ListModels().map(async (x) => ({
      model: x,
      title: GetModelName(x),
      supportsDocuments: documentCapable.has(
        String(x).includes("/") ? String(x) : `openai/${x}`,
      ),
    })),
  );
  const libraryIntegrationEnabled =
    String(process.env.LIBRARY_INTEGRATION_ENABLED || "false")
      .trim()
      .toLowerCase() === "true";
  const librarianApiUrl = process.env.LIBRARIAN_API_URL || "";
  // Sentiment/emotion analysis is optional: only advertised when the service
  // is configured (SENTIMENT_INTEGRATION_ENABLED + SENTIMENT_API_URL in env).
  // The URL itself is never exposed to clients.
  const sentimentEnabled = sentimentIntegrationEnabled();
  // When the default model changes, set PREVIOUS_DEFAULT_MODEL to the old
  // default so clients can migrate users who never picked a model themselves.
  const previousDefaultModel = process.env.PREVIOUS_DEFAULT_MODEL || "";
  res.json({
    donateOptions: donateOptions,
    quote: quote,
    models,
    showLogin,
    libraryIntegrationEnabled,
    librarianApiUrl,
    previousDefaultModel,
    sentimentEnabled,
  });
});

// SPA catch-all: serve index.html for all non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../Frontend/index.html"));
});

// Centralized error handling middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error("Unhandled error at " + new Date() + ":", err);
  // Insufficient-balance errors (e.g. thrown by BillingDecorator/BillingApi)
  // should surface as a parseable 402 so clients can show a top-up CTA.
  if (err?.code === "INSUFFICIENT_BALANCE" || err?.status === 402) {
    res.status(402).json({
      error: err?.message ?? "Insufficient balance",
      code: "INSUFFICIENT_BALANCE",
    });
    return;
  }
  res.status(500).json({ error: "Internal Server Error" });
});

// Create HTTP server and WebSocket server
const server = createServer(app);
const wss = new WebSocket.Server({
  server,
  path: "/api/realtime/ws",
});

// Setup realtime voice WebSocket handling
setupRealtimeVoiceWebSocket(wss, messageLimiter);

server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
  console.log(
    `WebSocket server is available at ws://localhost:${port}/api/realtime/ws`,
  );
});

setupRunners();
registerLibraryTool();
registerArxivTools();
registerMemoryTools();
registerMcpJobTool();
registerSystemPromptTool();
registerScheduleWakeupTool();
registerImageGenerateTool();
registerIntrospectionTools();

// Start the wake-up cron scheduler for push notifications
getWakeupService().start();
