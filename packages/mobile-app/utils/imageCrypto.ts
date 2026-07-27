/**
 * Client-side image decryption.
 *
 * Supports two encryption schemes:
 * - Symmetric (default): AES-256-GCM key travels in the reference token.
 *   Used for logged-out users or when the client has no keypair.
 * - Asymmetric (scheme=rsa): The AES key in the token is RSA-OAEP encrypted
 *   with the client's public key. The client decrypts it with its private key.
 *   The server CANNOT decrypt images in this scheme.
 *
 * Wire format (both schemes): `data` is `ciphertext || authTag` (16-byte tag),
 * `iv` is the 12-byte GCM nonce — both from the reference token.
 *
 * Reference-token formats:
 *   Symmetric:  togoder-image://<id>?key=<aes_key_b64>&iv=<iv_b64>
 *   Asymmetric: togoder-image://<id>?key=<rsa_encrypted_key_b64>&iv=<iv_b64>&scheme=rsa
 */

import { rsaDecryptAesKey, getPublicKey } from './imageKeypair';

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
  scheme: string | null;
} | null {
  const m = ref.match(
    /^togoder-image:\/\/([a-f0-9]{32})\?key=([^&]+)&iv=([^&\s)]+)(?:&scheme=([^&\s)]+))?$/i,
  );
  if (!m) return null;
  return {
    id: m[1],
    key: decodeURIComponent(m[2]),
    iv: decodeURIComponent(m[3]),
    scheme: m[4] ? decodeURIComponent(m[4]) : null,
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
 * Fetch the encrypted image blob from the server, decrypt it, and return a
 * data: URI for rendering.
 *
 * Auto-detects the encryption scheme from the reference token:
 * - scheme=rsa: decrypts the AES key with the client's RSA private key first
 * - no scheme: uses the AES key directly from the token (symmetric legacy)
 *
 * Returns null on any failure (network, decryption, missing private key).
 */
export async function fetchAndDecryptImage(
  ref: string,
  apiBase: string,
): Promise<string | null> {
  const parsed = parseImageRef(ref);
  if (!parsed) return null;

  try {
    // Include the public key as a query parameter so the server can verify
    // the requesting client matches the key used at encryption time.
    const pubkey = await getPublicKey();
    const url = new URL(`${apiBase}/chat/image/${parsed.id}`);
    if (pubkey) {
      url.searchParams.set('pubkey', pubkey);
    }

    const resp = await fetch(url.toString());
    if (!resp.ok) return null;

    const buf = await resp.arrayBuffer();
    const ctTag = new Uint8Array(buf);

    let keyB64 = parsed.key;

    // If asymmetric (RSA-encrypted AES key), decrypt it with private key
    if (parsed.scheme === 'rsa') {
      const aesKeyBuf = await rsaDecryptAesKey(parsed.key);
      if (!aesKeyBuf || aesKeyBuf.length !== 32) return null;
      // Convert recovered AES key buffer to base64 for decryptImageData
      keyB64 = btoa(String.fromCharCode(...new Uint8Array(aesKeyBuf)));
    }

    const b64 = decryptImageData(keyB64, parsed.iv, ctTag);
    if (!b64) return null;

    return `data:image/png;base64,${b64}`;
  } catch {
    return null;
  }
}
