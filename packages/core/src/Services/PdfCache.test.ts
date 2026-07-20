import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  storePdf,
  getPdf,
  releasePdf,
  releaseChat,
  setCacheTtl,
  clearPdfCache,
} from "./PdfCache";

describe("PdfCache", () => {
  beforeEach(() => {
    clearPdfCache();
    setCacheTtl(null);
  });

  afterEach(() => {
    clearPdfCache();
    setCacheTtl(null);
  });

  it("stores and retrieves a PDF by id", () => {
    const id = storePdf({ name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" });
    const got = getPdf(id);
    expect(got).not.toBeNull();
    expect(got!.name).toBe("doc.pdf");
    expect(got!.data).toBe("AAAB");
    expect(got!.mimeType).toBe("application/pdf");
  });

  it("returns null for unknown ids", () => {
    expect(getPdf("nonexistent")).toBeNull();
  });

  it("evicts on TTL expiry", () => {
    setCacheTtl(100);
    const id = storePdf({ name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" });
    vi.useFakeTimers();
    // Advance 50ms (under the 100ms idle TTL) and bump lastUsedAt by reading.
    vi.setSystemTime(new Date(Date.now() + 50));
    expect(getPdf(id)).not.toBeNull();
    // Advance 50ms again (still under 100ms since the last read).
    vi.setSystemTime(new Date(Date.now() + 50));
    expect(getPdf(id)).not.toBeNull();
    // Advance past the idle TTL since the last use -> evicted.
    vi.setSystemTime(new Date(Date.now() + 5000));
    expect(getPdf(id)).toBeNull();
    vi.useRealTimers();
  });

  it("ref-counts per chat and evicts when the last reference is released", () => {
    const id = storePdf(
      { name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" },
      "chat-1",
    );
    expect(getPdf(id)).not.toBeNull();
    releasePdf(id, "chat-1");
    expect(getPdf(id)).toBeNull();
  });

  it("supports multiple chats; evicts only when all release", () => {
    const id = storePdf(
      { name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" },
      "chat-1",
    );
    // attach a second chat via getPdf's ref bump
    getPdf(id, "chat-2");
    releasePdf(id, "chat-1");
    expect(getPdf(id)).not.toBeNull();
    releasePdf(id, "chat-2");
    expect(getPdf(id)).toBeNull();
  });

  it("releaseChat drops a chat's references", () => {
    const id = storePdf(
      { name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" },
      "chat-1",
    );
    releaseChat("chat-1");
    expect(getPdf(id)).toBeNull();
  });

  it("releaseChat on an unreferenced chat is a no-op", () => {
    const id = storePdf(
      { name: "doc.pdf", mimeType: "application/pdf", data: "AAAB" },
      "chat-1",
    );
    releaseChat("chat-other");
    expect(getPdf(id)).not.toBeNull();
  });

  it("returns distinct ids for distinct uploads", () => {
    const a = storePdf({ name: "a.pdf", mimeType: "application/pdf", data: "AAAB" });
    const b = storePdf({ name: "b.pdf", mimeType: "application/pdf", data: "BBBB" });
    expect(a).not.toBe(b);
  });
});
