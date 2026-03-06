import { Platform } from "react-native";
import { ICryptoService } from "./types";

/**
 * CryptoService facade that provides platform-specific encryption implementations.
 *
 * - iOS: Uses react-native-quick-crypto via IOSCryptoService
 * - Android: Uses react-native-quick-crypto via AndroidCryptoService
 * - Web: Uses native Web Crypto API via WebCryptoService
 *
 * All implementations use:
 * - PBKDF2 for key derivation (100,000 iterations, SHA-256)
 * - AES-256-GCM for encryption
 * - Blob format: [12 bytes IV][ciphertext][16 bytes tag] - base64 encoded
 */
export class CryptoService {
  private static instance: ICryptoService;

  private static getInstance(): ICryptoService {
    if (!CryptoService.instance) {
      if (Platform.OS === "ios") {
        const { IOSCryptoService } = require("./IOSCryptoService");
        CryptoService.instance = new IOSCryptoService();
      } else if (Platform.OS === "android") {
        const { AndroidCryptoService } = require("./AndroidCryptoService");
        CryptoService.instance = new AndroidCryptoService();
      } else {
        const { WebCryptoService } = require("./WebCryptoService");
        CryptoService.instance = new WebCryptoService();
      }
    }
    return CryptoService.instance;
  }

  /**
   * Derive encryption key from password using PBKDF2
   * Salt is based on userId for deterministic key derivation
   */
  static async deriveKey(userId: string, password: string): Promise<void> {
    return CryptoService.getInstance().deriveKey(userId, password);
  }

  /**
   * Clear the encryption key (e.g., on logout)
   */
  static clearKey(): void {
    return CryptoService.getInstance().clearKey();
  }

  /**
   * Check if the service is initialized with a key
   */
  static isInitialized(): boolean {
    return CryptoService.getInstance().isInitialized();
  }

  /**
   * Encrypt data using AES-256-GCM
   * Returns a single base64 blob: [IV][ciphertext][tag]
   */
  static async encrypt(data: string): Promise<string> {
    return CryptoService.getInstance().encrypt(data);
  }

  /**
   * Decrypt data using AES-256-GCM
   * Expects a single base64 blob: [IV][ciphertext][tag]
   */
  static async decrypt(encryptedBlob: string): Promise<string> {
    return CryptoService.getInstance().decrypt(encryptedBlob);
  }

  /**
   * Re-encrypt data with a new password
   * Used when user changes their password
   */
  static async reEncrypt(
    encryptedBlob: string,
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<string> {
    return CryptoService.getInstance().reEncrypt(
      encryptedBlob,
      userId,
      oldPassword,
      newPassword
    );
  }
}
