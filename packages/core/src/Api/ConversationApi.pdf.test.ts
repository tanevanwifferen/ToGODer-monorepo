import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  hasPdfArtifact,
  buildLlmMessages,
} from "./ConversationApi";
import { storePdf, clearPdfCache } from "../Services/PdfCache";
import { ChatRequest } from "../Model/ChatRequest";

// Mock modelSupportsDocuments so buildLlmMessages doesn't hit the network.
vi.mock("../LLM/Model/AIProvider", () => ({
  // minimal surface used by ConversationApi + ChatRequest types
  AIProvider: {},
  getAIWrapper: vi.fn(() => ({
    getResponse: async () => ({ choices: [{ message: { content: "" } }] }),
    streamResponse: async function* () {},
    streamResponseWithTools: async function* () {},
    getJSONResponse: async () => ({ choices: [{ message: { content: "{}" } }], usage: { total_tokens: 0 } }),
  })),
  getDefaultModel: vi.fn(() => "openai/gpt-4o"),
  modelSupportsDocuments: vi.fn(async () => true),
}));

// Mock everything else ConversationApi imports so it loads cleanly.
vi.mock("../Services/ChatService", () => ({}));
vi.mock("../Services/MemoryService", () => ({}));
vi.mock("../Api/BillingApi", () => ({}));
vi.mock("../Decorators/BillingDecorator", () => ({}));

import { modelSupportsDocuments } from "../LLM/Model/AIProvider";
const supportsDocs = () =>
  modelSupportsDocuments as unknown as ReturnType<typeof vi.fn>;

function makeRequest(over: Partial<ChatRequest>): ChatRequest {
  return {
    model: "anthropic/claude-sonnet-4" as any,
    humanPrompt: false,
    keepGoing: false,
    outsideBox: false,
    holisticTherapist: false,
    communicationStyle: 0,
    prompts: [{ role: "user", content: "summarize this" }],
    assistant_name: "ToGODer",
    memoryIndex: [],
    memories: {},
    ...over,
  };
}

describe("ConversationApi - PDF out-of-band handling", () => {
  beforeEach(() => {
    clearPdfCache();
    supportsDocs().mockReset();
    supportsDocs().mockResolvedValue(true);
  });
  afterEach(() => {
    clearPdfCache();
  });

  describe("hasPdfArtifact", () => {
    it("is true when a cached pdfCacheId resolves", () => {
      const id = storePdf({ name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" });
      const req = makeRequest({ pdfCacheId: id });
      expect(hasPdfArtifact(req)).toBe(true);
    });

    it("is false when the cache id is missing/expired", () => {
      const req = makeRequest({ pdfCacheId: "nonexistent" });
      expect(hasPdfArtifact(req)).toBe(false);
    });

    it("is true for the legacy base64 artifact path", () => {
      const req = makeRequest({
        artifactIndex: [
          { path: "/doc.pdf", name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" },
        ],
      });
      expect(hasPdfArtifact(req)).toBe(true);
    });

    it("is false when no PDF is present", () => {
      expect(hasPdfArtifact(makeRequest({}))).toBe(false);
    });
  });

  describe("buildLlmMessages - cache id resolution", () => {
    it("injects a native file content part from the cached upload", async () => {
      const id = storePdf({ name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" });
      const req = makeRequest({ pdfCacheId: id });
      const messages = await buildLlmMessages(req);
      const last = messages[messages.length - 1] as any;
      expect(Array.isArray(last.content)).toBe(true);
      const filePart = (last.content as any[]).find((p) => p.type === "file");
      expect(filePart).toBeDefined();
      expect(filePart.file.file_data).toBe("data:application/pdf;base64,AAAB");
      expect(filePart.file.filename).toBe("doc.pdf");
    });

    it("uses pdfName override when provided", async () => {
      const id = storePdf({ name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" });
      const req = makeRequest({ pdfCacheId: id, pdfName: "custom.pdf" });
      const messages = await buildLlmMessages(req);
      const last = messages[messages.length - 1] as any;
      const filePart = (last.content as any[]).find((p) => p.type === "file");
      expect(filePart.file.filename).toBe("custom.pdf");
    });

    it("does not inject file parts when the model is not document-capable", async () => {
      supportsDocs().mockResolvedValue(false);
      const id = storePdf({ name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" });
      const req = makeRequest({ pdfCacheId: id });
      const messages = await buildLlmMessages(req);
      const last = messages[messages.length - 1] as any;
      expect(typeof last.content).toBe("string"); // unchanged
    });

    it("keeps the text content as a text part", async () => {
      const id = storePdf({ name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" });
      const req = makeRequest({ pdfCacheId: id });
      const messages = await buildLlmMessages(req);
      const last = messages[messages.length - 1] as any;
      const textPart = (last.content as any[]).find((p) => p.type === "text");
      expect(textPart.text).toBe("summarize this");
    });
  });
});
