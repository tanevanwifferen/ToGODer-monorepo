import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";
import {
  fetchDocumentCapableModels,
  cachedSupportsDocuments,
  setCacheTtl,
  clearModelCache,
  OpenRouterModel,
} from "./OpenRouterModels";

vi.mock("axios", () => ({
  default: { get: vi.fn() },
}));
const axiosGet = () =>
  (axios as unknown as { get: ReturnType<typeof vi.fn> }).get;

function modelsResponse(models: OpenRouterModel[]) {
  return { data: { data: models } };
}

describe("OpenRouterModels - file-modality filtering", () => {
  beforeEach(() => {
    clearModelCache();
    setCacheTtl(null); // default 1h
    axiosGet().mockReset();
  });

  afterEach(() => {
    clearModelCache();
  });

  it('keeps only models whose input_modalities include "file"', async () => {
    axiosGet().mockResolvedValueOnce(
      modelsResponse([
        {
          id: "anthropic/claude-sonnet-4",
          architecture: { input_modalities: ["text", "image", "file"] },
        },
        {
          id: "deepseek/deepseek-chat-v3.1",
          architecture: { input_modalities: ["text"] },
        },
        {
          id: "google/gemini-3.1-pro-preview",
          architecture: { input_modalities: ["text", "file"] },
        },
        { id: "no-arch" },
        { id: "no-modalities", architecture: {} },
      ]),
    );

    const capable = await fetchDocumentCapableModels();

    expect(capable.has("anthropic/claude-sonnet-4")).toBe(true);
    expect(capable.has("google/gemini-3.1-pro-preview")).toBe(true);
    expect(capable.has("deepseek/deepseek-chat-v3.1")).toBe(false);
    expect(capable.size).toBe(2);
  });

  it("synchronous cache check reflects the last fetch", async () => {
    axiosGet().mockResolvedValueOnce(
      modelsResponse([
        {
          id: "openai/gpt-4o",
          architecture: { input_modalities: ["text", "image", "file"] },
        },
      ]),
    );
    expect(cachedSupportsDocuments("openai/gpt-4o")).toBeNull();
    await fetchDocumentCapableModels();
    expect(cachedSupportsDocuments("openai/gpt-4o")).toBe(true);
    expect(cachedSupportsDocuments("openai/gpt-4")).toBe(false);
  });
});

describe("OpenRouterModels - caching behavior", () => {
  beforeEach(() => {
    clearModelCache();
    axiosGet().mockReset();
  });
  afterEach(() => {
    clearModelCache();
    setCacheTtl(null);
  });

  it("does not re-fetch within the TTL", async () => {
    axiosGet().mockResolvedValue(
      modelsResponse([
        { id: "a/1", architecture: { input_modalities: ["text", "file"] } },
      ]),
    );
    setCacheTtl(60 * 1000);

    await fetchDocumentCapableModels();
    await fetchDocumentCapableModels();
    await fetchDocumentCapableModels();

    expect(axiosGet()).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after the TTL expires", async () => {
    axiosGet().mockResolvedValue(
      modelsResponse([
        { id: "a/1", architecture: { input_modalities: ["text", "file"] } },
      ]),
    );
    setCacheTtl(10); // 10ms

    await fetchDocumentCapableModels();
    await new Promise((r) => setTimeout(r, 30));
    await fetchDocumentCapableModels();

    expect(axiosGet()).toHaveBeenCalledTimes(2);
  });

  it("dedups concurrent callers with a single in-flight fetch", async () => {
    axiosGet().mockResolvedValue(
      modelsResponse([
        { id: "a/1", architecture: { input_modalities: ["text", "file"] } },
      ]),
    );

    await Promise.all([
      fetchDocumentCapableModels(),
      fetchDocumentCapableModels(),
      fetchDocumentCapableModels(),
    ]);

    expect(axiosGet()).toHaveBeenCalledTimes(1);
  });

  it("keeps the previous cache on fetch failure (no silent emptying)", async () => {
    axiosGet().mockResolvedValueOnce(
      modelsResponse([
        { id: "a/1", architecture: { input_modalities: ["text", "file"] } },
      ]),
    );
    await fetchDocumentCapableModels();
    expect(cachedSupportsDocuments("a/1")).toBe(true);

    // Next fetch fails; the prior capability set must remain available.
    axiosGet().mockRejectedValueOnce(new Error("network down"));
    setCacheTtl(1);
    await new Promise((r) => setTimeout(r, 5));
    const capable = await fetchDocumentCapableModels();
    expect(capable.has("a/1")).toBe(true);
  });
});
