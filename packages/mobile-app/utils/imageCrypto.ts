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
import { base64ToBytes, bytesToBase64 } from './base64';

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
 * Extract all togoder-image:// reference URLs from text content.
 * Returns unique refs in order of first appearance.
 */
export function extractAllImageRefs(text: string): string[] {
  const re = /togoder-image:\/\/[a-f0-9]{32}\?key=[^\s&]+&iv=[^\s&]+(?:&scheme=[^\s&]+)?/gi;
  const seen = new Set<string>();
  const refs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      refs.push(match[0]);
    }
  }
  return refs;
}

/**
 * Decrypt raw ciphertext bytes (ct || tag) with the given key and nonce.
 * All inputs are base64 strings (as they appear in the reference token).
 * Returns the base64-encoded plaintext bytes, or null on auth failure /
 * malformed input.
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
      console.warn('[imageCrypto] decryptImageData: malformed input', {
        keyLen: key.length,
        ivLen: iv.length,
        ctTagLen: ctTag.length,
      });
      return null;
    }

    const aes = gcm(key, iv);
    const plain = aes.decrypt(ctTag); // @noble/ciphers handles the tag internally
    const b64 = bytesToBase64(plain);
    console.log('[imageCrypto] decryptImageData: success', { plainLen: plain.length });
    return b64;
  } catch (e: any) {
    console.warn('[imageCrypto] decryptImageData: error', e?.message ?? e);
    return null;
  }
}

/**
 * Fetch the encrypted image blob from the server, decrypt it, and return
 * the raw base64-encoded image bytes (no data: URI prefix).
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
  console.log('[imageCrypto] fetchAndDecryptImage: start', { ref: ref.slice(0, 60) });

  const parsed = parseImageRef(ref);
  if (!parsed) {
    console.warn('[imageCrypto] fetchAndDecryptImage: parseImageRef failed');
    return null;
  }

  console.log('[imageCrypto] fetchAndDecryptImage: parsed', {
    id: parsed.id,
    scheme: parsed.scheme ?? 'symmetric',
    keyLen: parsed.key.length,
  });

  try {
    // Include the public key as a query parameter so the server can verify
    // the requesting client matches the key used at encryption time.
    const pubkey = await getPublicKey();
    const url = new URL(`${apiBase}/chat/blob`);
    url.searchParams.set('ref', ref);
    if (pubkey) {
      url.searchParams.set('pubkey', pubkey);
    }

    const fetchUrl = url.toString();
    console.log('[imageCrypto] fetchAndDecryptImage: fetching', { url: fetchUrl.slice(0, 80) });

    const resp = await fetch(fetchUrl);
    if (!resp.ok) {
      console.warn('[imageCrypto] fetchAndDecryptImage: fetch failed', {
        status: resp.status,
        statusText: resp.statusText,
      });
      return null;
    }

    const buf = await resp.arrayBuffer();
    const ctTag = new Uint8Array(buf);
    console.log('[imageCrypto] fetchAndDecryptImage: fetched blob', { size: ctTag.length });

    let keyB64 = parsed.key;

    // If asymmetric (RSA-encrypted AES key), decrypt it with private key
    if (parsed.scheme === 'rsa') {
      console.log('[imageCrypto] fetchAndDecryptImage: RSA decrypt key');
      const aesKeyBuf = await rsaDecryptAesKey(parsed.key);
      if (!aesKeyBuf || aesKeyBuf.length !== 32) {
        console.warn('[imageCrypto] fetchAndDecryptImage: RSA key decrypt failed', {
          bufLen: aesKeyBuf?.length,
        });
        return null;
      }
      // Convert recovered AES key buffer to base64 for decryptImageData
      keyB64 = bytesToBase64(new Uint8Array(aesKeyBuf));
      console.log('[imageCrypto] fetchAndDecryptImage: RSA key decrypted');
    }

    const b64 = decryptImageData(keyB64, parsed.iv, ctTag);
    if (!b64) {
      console.warn('[imageCrypto] fetchAndDecryptImage: decryptImageData failed');
      return null;
    }

    console.log('[imageCrypto] fetchAndDecryptImage: success', { b64Len: b64.length });
    return b64;
  } catch (e: any) {
    console.warn('[imageCrypto] fetchAndDecryptImage: exception', e?.message ?? e);
    return null;
  }
}
