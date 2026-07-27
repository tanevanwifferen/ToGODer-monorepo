/**
 * Client-side RSA keypair management for asymmetric image encryption.
 *
 * Native (iOS/Android) implementation: uses react-native-quick-crypto for
 * RSA operations and AsyncStorage for persistence.
 *
 * See imageKeypair.ts for the web implementation.
 */

import QuickCrypto from "react-native-quick-crypto";
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

  await AsyncStorage.multiSet([
    [STORAGE_KEY_PUBLIC, publicKey],
    [STORAGE_KEY_PRIVATE, privateKey],
  ]);

  return publicKey;
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
    return await AsyncStorage.getItem(STORAGE_KEY_PRIVATE);
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
): Promise<Buffer | null> {
  try {
    const privateKeyPem = await getPrivateKey();
    if (!privateKeyPem) return null;

    const encryptedKey = Buffer.from(encryptedKeyB64, "base64");
    const aesKey = QuickCrypto.privateDecrypt(
      {
        key: privateKeyPem,
        padding: QuickCrypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      encryptedKey,
    );

    return Buffer.from(aesKey);
  } catch {
    return null;
  }
}
