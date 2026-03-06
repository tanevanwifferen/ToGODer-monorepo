import { ICryptoService } from "./types";

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 256; // bits for AES-256
const IV_LENGTH = 12; // bytes, 96 bits for GCM

/**
 * CryptoService implementation for Web using native Web Crypto API
 * Uses PBKDF2 for key derivation and AES-256-GCM for encryption
 *
 * Blob format: [12 bytes IV][ciphertext][16 bytes tag] - base64 encoded
 */
export class WebCryptoService implements ICryptoService {
  private encryptionKey: CryptoKey | null = null;

  /**
   * Derive encryption key from password using PBKDF2
   * Salt is based on userId for deterministic key derivation
   */
  async deriveKey(userId: string, password: string): Promise<void> {
    const encoder = new TextEncoder();
    const salt = encoder.encode(`togoder-sync-${userId}`);
    const passwordBuffer = encoder.encode(password);

    // Import password as a key for PBKDF2
    const passwordKey = await crypto.subtle.importKey(
      "raw",
      passwordBuffer,
      "PBKDF2",
      false,
      ["deriveKey"]
    );

    // Derive the actual encryption key
    this.encryptionKey = await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt,
        iterations: PBKDF2_ITERATIONS,
        hash: "SHA-256",
      },
      passwordKey,
      { name: "AES-GCM", length: KEY_LENGTH },
      false,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * Clear the encryption key (e.g., on logout)
   */
  clearKey(): void {
    this.encryptionKey = null;
  }

  /**
   * Check if the service is initialized with a key
   */
  isInitialized(): boolean {
    return this.encryptionKey !== null;
  }

  /**
   * Encrypt data using AES-256-GCM
   * Returns a single base64 blob: [IV][ciphertext][tag]
   */
  async encrypt(data: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error("CryptoService not initialized - call deriveKey first");
    }

    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Encrypt with AES-GCM (tag is automatically appended to ciphertext)
    const encryptedBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      this.encryptionKey,
      dataBuffer
    );

    // Web Crypto appends 16-byte auth tag to ciphertext
    const encryptedArray = new Uint8Array(encryptedBuffer);

    // Combine: [IV][ciphertext+tag]
    const combined = new Uint8Array(IV_LENGTH + encryptedArray.length);
    combined.set(iv, 0);
    combined.set(encryptedArray, IV_LENGTH);

    return this.arrayToBase64(combined);
  }

  /**
   * Decrypt data using AES-256-GCM
   * Expects a single base64 blob: [IV][ciphertext][tag]
   */
  async decrypt(encryptedBlob: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error("CryptoService not initialized - call deriveKey first");
    }

    const combined = this.base64ToArray(encryptedBlob);

    // Extract IV (first 12 bytes)
    const iv = combined.slice(0, IV_LENGTH);
    // Rest is ciphertext + tag (Web Crypto expects them together)
    const ciphertextWithTag = combined.slice(IV_LENGTH);

    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      this.encryptionKey,
      ciphertextWithTag
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  }

  /**
   * Re-encrypt data with a new password
   * Used when user changes their password
   */
  async reEncrypt(
    encryptedBlob: string,
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<string> {
    // Derive old key and decrypt
    await this.deriveKey(userId, oldPassword);
    const plaintext = await this.decrypt(encryptedBlob);

    // Derive new key and encrypt
    await this.deriveKey(userId, newPassword);
    return this.encrypt(plaintext);
  }

  private arrayToBase64(array: Uint8Array): string {
    let binary = "";
    for (let i = 0; i < array.length; i++) {
      binary += String.fromCharCode(array[i]);
    }
    return btoa(binary);
  }

  private base64ToArray(base64: string): Uint8Array {
    const binary = atob(base64);
    const array = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      array[i] = binary.charCodeAt(i);
    }
    return array;
  }
}
