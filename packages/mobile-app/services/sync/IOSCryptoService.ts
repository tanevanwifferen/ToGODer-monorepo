const { pbkdf2 } = require("@noble/hashes/pbkdf2.js");
const { sha256 } = require("@noble/hashes/sha2.js");
const { gcm } = require("@noble/ciphers/aes.js");
const { randomBytes } = require("@noble/ciphers/utils.js");
import { ICryptoService } from "./types";

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 32 bytes = 256 bits for AES-256
const IV_LENGTH = 12; // 12 bytes = 96 bits for GCM

/**
 * CryptoService implementation for iOS using @noble/hashes and @noble/ciphers
 * Uses PBKDF2 for key derivation and AES-256-GCM for encryption
 *
 * Noble libraries are pure JavaScript implementations that work reliably on iOS
 * without the native module issues that affect react-native-quick-crypto
 *
 * Blob format: [12 bytes IV][ciphertext][16 bytes tag] - base64 encoded
 */
export class IOSCryptoService implements ICryptoService {
  private encryptionKey: Uint8Array | null = null;

  /**
   * Derive encryption key from password using PBKDF2
   * Salt is based on userId for deterministic key derivation
   */
  async deriveKey(userId: string, password: string): Promise<void> {
    const encoder = new TextEncoder();
    const salt = encoder.encode(`togoder-sync-${userId}`);
    const passwordBytes = encoder.encode(password);

    this.encryptionKey = pbkdf2(sha256, passwordBytes, salt, {
      c: PBKDF2_ITERATIONS,
      dkLen: KEY_LENGTH,
    });
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
    const dataBytes = encoder.encode(data);

    // Generate random IV
    const iv = randomBytes(IV_LENGTH);

    // Create AES-GCM cipher and encrypt
    const aes = gcm(this.encryptionKey, iv);
    const ciphertext = aes.encrypt(dataBytes);

    // noble/ciphers GCM already appends the 16-byte auth tag to ciphertext
    // Combine: [IV][ciphertext+tag]
    const combined = new Uint8Array(IV_LENGTH + ciphertext.length);
    combined.set(iv, 0);
    combined.set(ciphertext, IV_LENGTH);

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
    // Rest is ciphertext + tag (noble/ciphers expects them together)
    const ciphertextWithTag = combined.slice(IV_LENGTH);

    // Create AES-GCM cipher and decrypt
    const aes = gcm(this.encryptionKey, iv);
    const decrypted = aes.decrypt(ciphertextWithTag);

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
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
