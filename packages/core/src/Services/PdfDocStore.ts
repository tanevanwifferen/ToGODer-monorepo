/**
 * Persisted out-of-band PDF document store.
 *
 * The companion to the in-memory {@link PdfCache}: where the hot cache holds
 * the *decrypted* bytes for the duration of a chat turn (for fast retries),
 * this store holds the *encrypted* bytes on disk so an uploaded PDF survives
 * across messages AND across server restarts. Only the client can produce the
 * decryption key (derived client-side from a per-user secret + the document
 * title), so at rest the server only ever has ciphertext.
 *
 * Layout: one JSON file per document under `PDF_DOC_DIR` (env) or
 * `<cwd>/data/pdf-docs/`. Each file is `{id, name, mimeType, iv, data}`
 * where `iv` is the base64 GCM nonce and `data` is the base64
 * `ciphertext || authTag` (the format @noble/ciphers' `gcm` produces). The
 * plaintext never touches disk.
 *
 * The in-memory PdfCache is seeded from a decrypted doc at send time (see
 * ConversationApi.injectPdfFileParts), so the existing ref-counted hot cache
 * and TTL/size eviction still apply to the decrypted copy.
 */
import fs from "fs";
import path from "path";

const DEFAULT_DIR = path.join(process.cwd(), "data", "pdf-docs");

function docDir(): string {
  return process.env.PDF_DOC_DIR || DEFAULT_DIR;
}

function docPath(id: string): string {
  // ids are hex; reject anything that isn't to avoid path traversal
  if (!/^[a-f0-9]+$/i.test(id)) {
    throw new Error("invalid document id");
  }
  return path.join(docDir(), `${id}.json`);
}

export interface EncryptedPdfDoc {
  id: string;
  name: string;
  mimeType: string;
  /** base64 GCM nonce (12 bytes) */
  iv: string;
  /** base64 ciphertext || authTag (16 bytes) — never plaintext */
  data: string;
  createdAt: number;
}

/**
 * Persist an encrypted PDF. Generates and returns the document id. Does NOT
 * keep a plaintext copy anywhere; the bytes here are ciphertext.
 */
export function storeEncryptedPdf(
  doc: Omit<EncryptedPdfDoc, "id" | "createdAt">,
): string {
  ensureDir();
  const id = generateId();
  const full: EncryptedPdfDoc = { ...doc, id, createdAt: Date.now() };
  fs.writeFileSync(docPath(id), JSON.stringify(full), "utf8");
  return id;
}

/**
 * Load an encrypted document (async — docs can be large, and this is on the
 * send path). Returns null when missing.
 */
export async function getEncryptedPdf(
  id: string,
): Promise<EncryptedPdfDoc | null> {
  try {
    const p = docPath(id);
    if (!fs.existsSync(p)) return null;
    const raw = await fs.promises.readFile(p, "utf8");
    return JSON.parse(raw) as EncryptedPdfDoc;
  } catch {
    return null;
  }
}

/** Synchronously check whether a persisted document exists (for gating). */
export function hasEncryptedPdf(id: string): boolean {
  if (!id || !/^[a-f0-9]+$/i.test(id)) return false;
  try {
    return fs.existsSync(docPath(id));
  } catch {
    return false;
  }
}

/** Delete a persisted document (best-effort). Called on release/remove. */
export function removeEncryptedPdf(id: string): void {
  try {
    const p = docPath(id);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    // best-effort
  }
}

function ensureDir(): void {
  fs.mkdirSync(docDir(), { recursive: true });
}

function generateId(): string {
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    const rb = require("crypto").randomBytes(16);
    for (let i = 0; i < 16; i++) bytes[i] = rb[i];
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
