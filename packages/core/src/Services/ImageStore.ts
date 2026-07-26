/**
 * Persisted out-of-band image store.
 *
 * Companion to ImageGenerateTool: generated images are encrypted server-side
 * with a freshly generated AES-256-GCM key and written to disk under a
 * bind-mount volume. Only a lightweight reference token (id + key + nonce)
 * is stored in the chat history. The client fetches the ciphertext from a
 * dedicated endpoint and decrypts it using the same AES-256-GCM utilities it
 * already uses for PDF storage.
 *
 * Layout: one JSON file per image under `IMAGE_STORE_DIR` (env) or
 * `<cwd>/data/images/`. Each file is `{id, iv, key}` where `iv` is the
 * base64 GCM nonce and `key` is the base64 AES-256 key. The actual encrypted
 * blob is stored as a separate `.bin` file (`<id>.bin`) — keep the ciphertext
 * out of JSON to avoid huge parse/serialize costs.
 *
 * The plaintext (generated image bytes) never touches disk.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";

const DEFAULT_DIR = path.join(process.cwd(), "data", "images");
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // GCM nonce
const TAG_LEN = 16; // GCM auth tag

function imageDir(): string {
  return process.env.IMAGE_STORE_DIR || DEFAULT_DIR;
}

function jsonPath(id: string): string {
  if (!/^[a-f0-9]+$/i.test(id)) {
    throw new Error("invalid image id");
  }
  return path.join(imageDir(), `${id}.json`);
}

function binPath(id: string): string {
  if (!/^[a-f0-9]+$/i.test(id)) {
    throw new Error("invalid image id");
  }
  return path.join(imageDir(), `${id}.bin`);
}

function ensureDir(): void {
  fs.mkdirSync(imageDir(), { recursive: true });
}

function generateId(): string {
  const bytes = crypto.randomBytes(16);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export interface EncryptedImageMeta {
  id: string;
  /** base64 AES-256 key */
  key: string;
  /** base64 GCM nonce (12 bytes) */
  iv: string;
  createdAt: number;
}

export interface EncryptedImagePayload {
  meta: EncryptedImageMeta;
  /** raw encrypted bytes: ciphertext || authTag */
  data: Buffer;
}

/**
 * Encrypt raw image bytes (base64-decoded) with a fresh random key, write
 * both the JSON meta and the `.bin` ciphertext to disk. Returns the metadata
 * (with the key and nonce) so the caller can build a reference token.
 */
export function storeEncryptedImage(base64Content: string): EncryptedImageMeta {
  ensureDir();

  const plaintext = Buffer.from(base64Content, "base64");
  const key = crypto.randomBytes(KEY_LEN);
  const iv = crypto.randomBytes(IV_LEN);

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_LEN,
  });
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const data = Buffer.concat([ct, tag]); // ct || tag

  const id = generateId();
  const meta: EncryptedImageMeta = {
    id,
    key: key.toString("base64"),
    iv: iv.toString("base64"),
    createdAt: Date.now(),
  };

  fs.writeFileSync(jsonPath(id), JSON.stringify(meta), "utf8");
  fs.writeFileSync(binPath(id), data);

  return meta;
}

/**
 * Load the encrypted image payload (meta + ciphertext) from disk.
 * Returns null when missing or malformed.
 */
export async function getEncryptedImage(
  id: string,
): Promise<EncryptedImagePayload | null> {
  try {
    const jp = jsonPath(id);
    const bp = binPath(id);
    if (!fs.existsSync(jp) || !fs.existsSync(bp)) return null;
    const metaRaw = await fs.promises.readFile(jp, "utf8");
    const meta = JSON.parse(metaRaw) as EncryptedImageMeta;
    const data = await fs.promises.readFile(bp);
    return { meta, data };
  } catch {
    return null;
  }
}

/** Synchronously check whether a persisted image exists. */
export function hasEncryptedImage(id: string): boolean {
  if (!id || !/^[a-f0-9]+$/i.test(id)) return false;
  try {
    return fs.existsSync(jsonPath(id)) && fs.existsSync(binPath(id));
  } catch {
    return false;
  }
}

/** Delete a persisted image (best-effort). */
export function removeEncryptedImage(id: string): void {
  try {
    const jp = jsonPath(id);
    const bp = binPath(id);
    if (fs.existsSync(jp)) fs.unlinkSync(jp);
    if (fs.existsSync(bp)) fs.unlinkSync(bp);
  } catch {
    // best-effort
  }
}
