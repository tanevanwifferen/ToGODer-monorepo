const {
  pbkdf2Sync,
  randomBytes,
  createCipheriv,
  createDecipheriv,
} = require("react-native-quick-crypto");
const { Buffer } = require("@craftzdog/react-native-buffer");
import { ICryptoService } from "./types";

// Lazy getter for Buffer to ensure polyfills are loaded before accessing
// This prevents "undefined is not a function" when the module is imported before polyfills run
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getBuffer = (): any => {
  // Prefer global.Buffer (set up by react-native-quick-crypto's install())
  // Fall back to the imported Buffer from @craftzdog/react-native-buffer
  return global.Buffer || Buffer;
};

const PBKDF2_ITERATIONS = 100000;
const KEY_LENGTH = 32; // 32 bytes = 256 bits for AES-256
const IV_LENGTH = 12; // 12 bytes = 96 bits for GCM

/**
 * CryptoService implementation for Android using react-native-quick-crypto
 * Uses PBKDF2 for key derivation and AES-256-GCM for encryption
 *
 * Blob format: [12 bytes IV][ciphertext][16 bytes tag] - base64 encoded
 */
export class AndroidCryptoService implements ICryptoService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private encryptionKey: any = null;

  /**
   * Derive encryption key from password using PBKDF2
   * Salt is based on userId for deterministic key derivation
   */
  async deriveKey(userId: string, password: string): Promise<void> {
    const BufferImpl = getBuffer();
    const salt = BufferImpl.from(`togoder-sync-${userId}`, "utf8");
    const passwordBuffer = BufferImpl.from(password, "utf8");

    this.encryptionKey = pbkdf2Sync(
      passwordBuffer,
      salt,
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      "SHA-256"
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

    const BufferImpl = getBuffer();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);

    const encrypted = BufferImpl.concat([
      cipher.update(BufferImpl.from(data, "utf8")),
      cipher.final(),
    ]);

    const tag = cipher.getAuthTag();

    // Combine: [IV][ciphertext][tag]
    const combined = BufferImpl.concat([BufferImpl.from(iv), encrypted, tag]);
    return combined.toString("base64");
  }

  /**
   * Decrypt data using AES-256-GCM
   * Expects a single base64 blob: [IV][ciphertext][tag]
   */
  async decrypt(encryptedBlob: string): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error("CryptoService not initialized - call deriveKey first");
    }

    const BufferImpl = getBuffer();
    const combined = BufferImpl.from(encryptedBlob, "base64");

    // Extract IV (first 12 bytes)
    const iv = combined.subarray(0, IV_LENGTH);
    // Extract tag (last 16 bytes)
    const tag = combined.subarray(-16);
    // Rest is ciphertext
    const ciphertext = combined.subarray(IV_LENGTH, -16);

    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, iv);
    decipher.setAuthTag(tag);

    const decrypted = BufferImpl.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return decrypted.toString("utf8");
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
}
