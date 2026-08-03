/**
 * Persisted out-of-band image store.
 *
 * Companion to ImageGenerateTool: generated images are encrypted server-side
 * and written to disk under a bind-mount volume. Only a lightweight reference
 * token is stored in the chat history.
 *
 * Two encryption schemes:
 * - Symmetric (default): AES-256-GCM with a fresh random key. Token carries
 *   the key + IV. Server CAN decrypt (key in .json meta). Used for logged-out
 *   users or when the client hasn't registered a public key.
 * - Asymmetric (when client provides RSA public key): Hybrid RSA+AES-256-GCM.
 *   A fresh AES key encrypts the image; the AES key is then encrypted with the
 *   client's RSA public key. Server CANNOT decrypt (no private key). Token
 *   carries the RSA-encrypted AES key + IV + `scheme=rsa`.
 *
 * Layout: one JSON file per image under `IMAGE_STORE_DIR` (env) or
 * `<cwd>/data/images/`. Each file is `{id, iv, key?, scheme?, createdAt}`.
 * The ciphertext is stored as `<id>.bin`. Plaintext never touches disk.
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
  /** base64 AES-256 key (plain for symmetric, RSA-encrypted for asymmetric) */
  key: string;
  /** base64 GCM nonce (12 bytes) */
  iv: string;
  /** Encryption scheme: absent/undefined = symmetric, "rsa" = asymmetric */
  scheme?: string;
  createdAt: number;
  /** SHA-256 hash of the public key PEM used to encrypt this image (hex).
   *  Allows the GET endpoint to verify that a fetch request's pubkey matches
   *  the one used at encryption time. Absent for legacy symmetric images. */
  pubkeyHash?: string;
}

export interface EncryptedImagePayload {
  meta: EncryptedImageMeta;
  /** raw encrypted bytes: ciphertext || authTag */
  data: Buffer;
}

/**
 * Encrypt raw image bytes (base64-decoded) with a fresh random AES key.
 * The key is stored as plaintext in meta — the server CAN decrypt.
 * Only used for symmetric (logged-out / no-public-key) flow.
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

// ── Asymmetric (hybrid RSA+AES-256-GCM) ────────────────────────

const RSA_PADDING = crypto.constants.RSA_PKCS1_OAEP_PADDING;
const RSA_OAEP_HASH = "sha256";

/**
 * Validate that a string looks like a well-formed RSA public key PEM.
 * Returns the SHA-256 hash (hex) of the canonicalized PEM on success,
 * or null if the input is not a valid RSA public key.
 */
export function validatePublicKeyPem(publicKeyPem: string): string | null {
  try {
    if (!publicKeyPem || typeof publicKeyPem !== 'string') return null;
    const trimmed = publicKeyPem.trim();
    if (!trimmed.startsWith('-----BEGIN PUBLIC KEY-----') ||
        !trimmed.endsWith('-----END PUBLIC KEY-----')) {
      return null;
    }
    // Try parsing it with Node crypto to ensure it's a real RSA key
    crypto.createPublicKey({ key: trimmed, format: 'pem', type: 'spki' });
    // Compute hash for later verification
    const hash = crypto.createHash('sha256').update(trimmed).digest('hex');
    return hash;
  } catch {
    return null;
  }
}

/**
 * Encrypt raw image bytes using hybrid RSA+AES-256-GCM.
 *
 * 1. Generate a fresh random AES-256 key + GCM nonce
 * 2. Encrypt the image plaintext with AES-256-GCM
 * 3. Encrypt the AES key with the client's RSA public key (OAEP)
 * 4. Store ciphertext on disk; return meta with the RSA-encrypted key
 *
 * The server never has the RSA private key and CANNOT decrypt the image.
 * Only the client (holding the private key) can recover the AES key.
 *
 * @param base64Content The base64-encoded image bytes (no data: prefix)
 * @param publicKeyPem The client's RSA public key in PEM format
 */
export function storeAsymmetricallyEncryptedImage(
  base64Content: string,
  publicKeyPem: string,
): EncryptedImageMeta {
  ensureDir();

  const plaintext = Buffer.from(base64Content, "base64");

  // 1. Generate random AES key + IV
  const aesKey = crypto.randomBytes(KEY_LEN);
  const iv = crypto.randomBytes(IV_LEN);

  // 2. AES-256-GCM encrypt the image
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv, {
    authTagLength: TAG_LEN,
  });
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const data = Buffer.concat([ct, tag]);

  // 3. RSA-OAEP encrypt the AES key
  const encryptedKey = crypto.publicEncrypt(
    { key: publicKeyPem, padding: RSA_PADDING, oaepHash: RSA_OAEP_HASH },
    aesKey,
  );

  const id = generateId();
  const pubkeyHash = crypto.createHash('sha256').update(publicKeyPem.trim()).digest('hex');
  const meta: EncryptedImageMeta = {
    id,
    key: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
    scheme: "rsa",
    createdAt: Date.now(),
    pubkeyHash,
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
