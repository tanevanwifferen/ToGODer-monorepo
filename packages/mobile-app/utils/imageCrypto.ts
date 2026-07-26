/**
 * Client-side image decryption.
 *
 * Generated images are encrypted server-side with AES-256-GCM and stored on
 * a bind-mount volume. The reference token embedded in the chat history
 * carries the key and nonce, so the client can fetch the ciphertext from
 * GET /api/chat/image/:id and decrypt it here.
 *
 * Uses the same @noble/ciphers + @noble/hashes stack as pdfCrypto.ts for
 * AES-256-GCM. Wire format: `data` is `ciphertext || authTag` (16-byte tag),
 * `iv` is the 12-byte nonce — both are embedded in the reference token.
 *
 * The reference-token format is:
 *   togoder-image://<hexId>?key=<base64key>&iv=<base64iv>
 */

const { gcm } = require("@noble/ciphers/aes.js");

const TAG_LENGTH = 16;

/**
 * Parse an image reference token into its components.
 * Returns null if the string isn't a togoder-image reference.
 */
export function parseImageRef(ref: string): {
  id: string;
  key: string;
  iv: string;
} | null {
  const m = ref.match(
    /^togoder-image:\/\/([a-f0-9]{32})\?key=([^&]+)&iv=([^&\s)]+)$/i,
  );
  if (!m) return null;
  return {
    id: m[1],
    key: decodeURIComponent(m[2]),
    iv: decodeURIComponent(m[3]),
  };
}

/**
 * Decrypt raw ciphertext bytes (ct || tag) with the given key and nonce.
 * All inputs are base64 strings (as they appear in the reference token).
 * Returns the base64 image content (suitable for a data: URI), or null on
 * auth failure / malformed input.
 */
export function decryptImageData(
  keyB64: string,
  ivB64: string,
  ctTag: Uint8Array,
): string | null {
  try {
    const key = base64ToBytes(keyB64);
    const iv = base64ToBytes(ivB64);

    if (key.length !== 32 || iv.length !== 12 || ctTag.length <= TAG_LENGTH) {
      return null;
    }

    const aes = gcm(key, iv);
    const plain = aes.decrypt(ctTag); // @noble/ciphers handles the tag internally
    return bytesToBase64(plain);
  } catch {
    return null;
  }
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Fetch the encrypted image blob from the server, decrypt it with the key
 * and nonce from the reference token, and return a data: URI for rendering.
 * Returns null on any failure.
 */
export async function fetchAndDecryptImage(
  ref: string,
  apiBase: string,
): Promise<string | null> {
  const parsed = parseImageRef(ref);
  if (!parsed) return null;

  try {
    const resp = await fetch(`${apiBase}/chat/image/${parsed.id}`);
    if (!resp.ok) return null;

    const buf = await resp.arrayBuffer();
    const ctTag = new Uint8Array(buf);
    const b64 = decryptImageData(parsed.key, parsed.iv, ctTag);
    if (!b64) return null;

    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}
