/**
 * Server-side decryption for persisted (encrypted) PDF documents.
 *
 * Clients derive an AES-256-GCM key from a per-user secret + the document
 * title (see mobile-app `utils/pdfCrypto`), encrypt the base64 PDF bytes, and
 * upload only the ciphertext + nonce. The server stores the ciphertext in
 * {@link PdfDocStore} and decrypts it transiently at send time using the key
 * the client includes in the chat request — so at rest the server holds only
 * ciphertext, and only the client can produce the key.
 *
 * Wire format (matches @noble/ciphers `gcm`): the stored `data` is
 * `ciphertext || authTag` (16-byte tag appended), base64; `iv` is the 12-byte
 * GCM nonce, base64. The decrypted output is the original base64 PDF string,
 * ready to inject as a `data:application/pdf;base64,...` file part.
 */
import crypto from "crypto";

const TAG_LENGTH = 16;

/**
 * Decrypt an encrypted PDF document into its base64 content string.
 * Returns null if the key/iv/data are malformed or authentication fails.
 */
export function decryptPdfData(
  keyB64: string,
  ivB64: string,
  ctTagB64: string,
): string | null {
  try {
    const key = Buffer.from(keyB64, "base64");
    const iv = Buffer.from(ivB64, "base64");
    const ctTag = Buffer.from(ctTagB64, "base64");
    if (key.length !== 32 || iv.length !== 12 || ctTag.length <= TAG_LENGTH) {
      return null;
    }
    const tag = ctTag.subarray(ctTag.length - TAG_LENGTH);
    const ct = ctTag.subarray(0, ctTag.length - TAG_LENGTH);

    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, {
      authTagLength: TAG_LENGTH,
    });
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]);
    return plain.toString("utf8"); // original base64 PDF string
  } catch {
    return null;
  }
}
