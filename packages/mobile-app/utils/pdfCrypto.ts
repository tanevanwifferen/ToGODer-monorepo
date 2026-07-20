/**
 * Client-side PDF attachment crypto.
 *
 * The client derives an AES-256-GCM key from a per-user secret (kept on the
 * client, never sent to the server) + the document title, then encrypts the
 * PDF before uploading. Only the ciphertext + nonce are uploaded; the server
 * stores them and decrypts transiently at send time using the key the client
 * includes in the chat request. So at rest the server holds only ciphertext,
 * and only the client can produce the key.
 *
 * The key is derived reproducibly (sha256(secret + ":" + title)) so the client
 * can re-derive it on every send without re-reading the file — the attachment
 * therefore persists across messages and across reloads (the secret + doc id +
 * title are persisted client-side) without re-upload.
 *
 * Uses @noble/hashes + @noble/ciphers (pure JS, web + native) — the same
 * stack as IOSCryptoService. Wire format matches the server's PdfCrypto:
 * `data` is base64 `ciphertext || authTag`, `iv` is base64 12-byte nonce.
 */
const { sha256 } = require("@noble/hashes/sha2.js");
const { gcm } = require("@noble/ciphers/aes.js");
const { randomBytes } = require("@noble/ciphers/utils.js");

const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM nonce

/** Derive a 32-byte AES-256-GCM key from a client secret + document title. */
export function derivePdfKey(
  secretBase64: string,
  title: string,
): Uint8Array {
  const encoder = new TextEncoder();
  // secret || ":" || title — deterministic, reproducible across sends/reloads
  const material = new Uint8Array([
    ...arrayFromBase64(secretBase64),
    ...encoder.encode(":" + title),
  ]);
  return sha256(material); // 32 bytes
}

/** Derive and return the key as base64 (the form sent in ChatRequest.pdfKey). */
export function derivePdfKeyBase64(secretBase64: string, title: string): string {
  return toBase64(derivePdfKey(secretBase64, title));
}

/**
 * Encrypt a base64 PDF string. Returns `{ iv, data }` (both base64) where
 * `data` is `ciphertext || authTag` — the exact format the server decrypts.
 */
export function encryptPdfData(
  key: Uint8Array,
  plaintextBase64: string,
): { iv: string; data: string } {
  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(plaintextBase64);
  const iv = randomBytes(IV_LENGTH);
  const aes = gcm(key, iv);
  const ciphertext = aes.encrypt(dataBytes); // ct || 16-byte tag
  return { iv: toBase64(iv), data: toBase64(ciphertext) };
}

/** Generate a fresh random client secret (base64), persisted per install. */
export function generatePdfSecret(): string {
  return toBase64(randomBytes(KEY_LENGTH));
}

function toBase64(array: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < array.length; i++) {
    binary += String.fromCharCode(array[i]);
  }
  return btoa(binary);
}

function arrayFromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return array;
}
