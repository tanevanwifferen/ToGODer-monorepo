/**
 * Client-side RSA keypair management for asymmetric image encryption.
 *
 * Native (iOS/Android) implementation: uses react-native-quick-crypto for
 * RSA operations, expo-secure-store (Keychain/Keystore) for the private key,
 * and AsyncStorage for the non-secret public key.
 *
 * See imageKeypair.ts for the web implementation.
 */

import QuickCrypto from "react-native-quick-crypto";
import * as SecureStore from "expo-secure-store";
import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY_PRIVATE = "togoder_image_private_key_pem";
const STORAGE_KEY_PUBLIC = "togoder_image_public_key_pem";

// ── Keypair generation ──────────────────────────────────────────

export async function generateAndStoreKeypair(): Promise<string> {
  const { publicKey, privateKey } = QuickCrypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  // Public key is not secret — AsyncStorage is fine
  await AsyncStorage.setItem(STORAGE_KEY_PUBLIC, publicKey);
  // Private key goes to secure hardware-backed storage (Keychain/Keystore)
  await SecureStore.setItemAsync(STORAGE_KEY_PRIVATE, privateKey, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  return publicKey;
}

/**
 * Generate a fresh keypair and replace the stored one.
 *
 * ⚠️ Old images encrypted with the previous public key become unreadable
 * after rotation — the new private key cannot decrypt them.
 */
export async function regenerateKeypair(): Promise<string> {
  // Remove old keys
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY_PRIVATE);
  } catch {}
  try {
    await AsyncStorage.removeItem(STORAGE_KEY_PUBLIC);
  } catch {}

  return generateAndStoreKeypair();
}

// ── Retrieval ────────────────────────────────────────────────────

export async function getPublicKey(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(STORAGE_KEY_PUBLIC);
  } catch {
    return null;
  }
}

export async function getPrivateKey(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(STORAGE_KEY_PRIVATE);
  } catch {
    return null;
  }
}

export async function getOrCreateKeypair(): Promise<string> {
  const existing = await getPublicKey();
  if (existing) return existing;
  return generateAndStoreKeypair();
}

// ── Decryption ───────────────────────────────────────────────────

export async function rsaDecryptAesKey(
  encryptedKeyB64: string,
): Promise<Uint8Array | null> {
  try {
    const privateKeyPem = await getPrivateKey();
    if (!privateKeyPem) {
      console.warn('[imageKeypair] rsaDecryptAesKey: no private key stored');
      return null;
    }

    const encryptedKey = Buffer.from(encryptedKeyB64, "base64");
    const aesKey = QuickCrypto.privateDecrypt(
      {
        key: privateKeyPem,
        padding: QuickCrypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      encryptedKey,
    );

    // Normalise to Uint8Array so both platforms return the same shape.
    return new Uint8Array(aesKey as any);
  } catch (e: any) {
    console.warn('[imageKeypair] rsaDecryptAesKey failed', e?.message ?? e);
    return null;
  }
}
