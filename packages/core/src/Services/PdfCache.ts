/**
 * Out-of-band PDF cache.
 *
 * Uploaded PDFs live here in memory keyed by a random id; the chat client
 * only references the id in its ChatRequest, so the message/conversation
 * payload never carries the PDF bytes. The backend resolves the cached
 * bytes at send time and injects native `file` content parts for
 * document-capable models (see ConversationApi.injectPdfFileParts).
 *
 * Entries are reference-counted per chat so the same uploaded file can be
 * reused across retries/regenerations of a turn, and evicted once the chat
 * no longer references them. A size-bounded LRU-style sweep and a max-age
 * TTL provide a backstop so the cache can't grow unbounded. This is
 * intentionally in-process (not persisted) — PDFs are ephemeral uploads
 * for the duration of a chat, not conversation history.
 */

const MAX_TOTAL_BYTES = 256 * 1024 * 1024; // 256 MB across all cached PDFs
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour idle

export interface CachedPdf {
  id: string;
  name: string;
  mimeType: string;
  /** base64-encoded content (no data-URI prefix) */
  data: string;
  createdAt: number;
  lastUsedAt: number;
  sizeBytes: number;
}

interface Entry extends CachedPdf {
  /** chatId -> count of outstanding references; entry is freed when all release */
  refs: Map<string, number>;
}

const cache = new Map<string, Entry>();
let totalBytes = 0;
let ttlMs = DEFAULT_TTL_MS;

/** Override the idle TTL (mainly for tests). Pass null to restore default. */
export function setCacheTtl(ms: number | null): void {
  ttlMs = ms == null ? DEFAULT_TTL_MS : ms;
}

/** Clear the entire cache (mainly for tests). */
export function clearPdfCache(): void {
  cache.clear();
  totalBytes = 0;
}

function approxBytes(data: string): number {
  // base64 is ~4/3 the raw size; good enough for budgeting
  return Math.ceil((data.length * 3) / 4);
}

/**
 * Store a PDF. Returns the cache id the client should reference. The PDF is
 * ref-counted for the given chat (if provided) so it survives retries until
 * released.
 */
export function storePdf(
  pdf: Omit<CachedPdf, "id" | "createdAt" | "lastUsedAt" | "sizeBytes"> &
    Partial<Pick<CachedPdf, "id">>,
  chatId?: string,
): string {
  const id = pdf.id ?? generateId();
  const sizeBytes = approxBytes(pdf.data);
  const entry: Entry = {
    ...pdf,
    id,
    createdAt: Date.now(),
    lastUsedAt: Date.now(),
    sizeBytes,
    refs: new Map(),
  };
  if (chatId) entry.refs.set(chatId, 1);
  cache.set(id, entry);
  totalBytes += sizeBytes;
  evict();
  return id;
}

/**
 * Look up a cached PDF and (optionally) bump its last-used timestamp and
 * reference count for the given chat. Returns null when missing/expired.
 */
export function getPdf(id: string, chatId?: string): CachedPdf | null {
  const entry = cache.get(id);
  if (!entry) return null;
  if (isExpired(entry)) {
    removeEntry(id);
    return null;
  }
  entry.lastUsedAt = Date.now();
  if (chatId) {
    entry.refs.set(chatId, (entry.refs.get(chatId) ?? 0) + 1);
  }
  return toCachedPdf(entry);
}

/**
 * Release a chat's reference to a cached PDF. When a chat has no remaining
 * references the entry is evicted (the upload is no longer needed).
 */
export function releasePdf(id: string, chatId: string): void {
  const entry = cache.get(id);
  if (!entry) return;
  const count = entry.refs.get(chatId) ?? 0;
  if (count <= 1) {
    entry.refs.delete(chatId);
  } else {
    entry.refs.set(chatId, count - 1);
  }
  if (entry.refs.size === 0) {
    removeEntry(id);
  }
}

/**
 * Drop every cached PDF referenced only by the given chat. Called when a
 * chat is cleared so its uploads don't linger.
 */
export function releaseChat(chatId: string): void {
  for (const id of Array.from(cache.keys())) {
    const entry = cache.get(id);
    if (!entry) continue;
    entry.refs.delete(chatId);
    if (entry.refs.size === 0) removeEntry(id);
  }
}

function removeEntry(id: string): void {
  const entry = cache.get(id);
  if (!entry) return;
  cache.delete(id);
  totalBytes -= entry.sizeBytes;
  if (totalBytes < 0) totalBytes = 0;
}

function isExpired(entry: Entry): boolean {
  return Date.now() - entry.lastUsedAt > ttlMs;
}

/** Evict expired entries, then oldest-by-lastUsed until under the byte budget. */
function evict(): void {
  for (const id of Array.from(cache.keys())) {
    const entry = cache.get(id);
    if (entry && isExpired(entry)) removeEntry(id);
  }
  if (totalBytes <= MAX_TOTAL_BYTES) return;
  const byAge = Array.from(cache.values()).sort(
    (a, b) => a.lastUsedAt - b.lastUsedAt,
  );
  for (const entry of byAge) {
    if (totalBytes <= MAX_TOTAL_BYTES) break;
    removeEntry(entry.id);
  }
}

function toCachedPdf(entry: Entry): CachedPdf {
  return {
    id: entry.id,
    name: entry.name,
    mimeType: entry.mimeType,
    data: entry.data,
    createdAt: entry.createdAt,
    lastUsedAt: entry.lastUsedAt,
    sizeBytes: entry.sizeBytes,
  };
}

function generateId(): string {
  // 128 bits of entropy; no external dep needed
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    // Node fallback
    const rb = require("crypto").randomBytes(16);
    for (let i = 0; i < 16; i++) bytes[i] = rb[i];
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
