/**
 * Client-side RSA keypair management for asymmetric image encryption.
 *
 * Web implementation: uses the Web Crypto API (crypto.subtle) for RSA
 * operations and localStorage for persistence.
 *
 * See imageKeypair.native.ts for the React Native implementation.
 */

const STORAGE_KEY_PRIVATE = "togoder_image_private_key_pem";
const STORAGE_KEY_PUBLIC = "togoder_image_public_key_pem";

// ── Keypair generation ──────────────────────────────────────────

export async function generateAndStoreKeypair(): Promise<string> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]), // 65537
      hash: "SHA-256",
    },
    true, // extractable
    ["encrypt", "decrypt"],
  );

  const publicKeyPem = await exportPublicKeyToPem(keyPair.publicKey);
  const privateKeyPem = await exportPrivateKeyToPem(keyPair.privateKey);

  localStorage.setItem(STORAGE_KEY_PUBLIC, publicKeyPem);
  localStorage.setItem(STORAGE_KEY_PRIVATE, privateKeyPem);

  return publicKeyPem;
}

// ── PEM export helpers (Web Crypto → PEM) ───────────────────────

async function exportPublicKeyToPem(key: CryptoKey): Promise<string> {
  const der = await crypto.subtle.exportKey("spki", key);
  return derToPem("PUBLIC KEY", new Uint8Array(der));
}

async function exportPrivateKeyToPem(key: CryptoKey): Promise<string> {
  const der = await crypto.subtle.exportKey("pkcs8", key);
  return derToPem("PRIVATE KEY", new Uint8Array(der));
}

function derToPem(label: string, der: Uint8Array): string {
  const b64 = btoa(String.fromCharCode(...der));
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----`;
}

function pemToDer(pem: string): Uint8Array {
  const b64 = pem
    .replace(/-----BEGIN .*?-----/, "")
    .replace(/-----END .*?-----/, "")
    .replace(/\s/g, "");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// ── Retrieval ────────────────────────────────────────────────────

export async function getPublicKey(): Promise<string | null> {
  return localStorage.getItem(STORAGE_KEY_PUBLIC);
}

export async function getPrivateKey(): Promise<string | null> {
  return localStorage.getItem(STORAGE_KEY_PRIVATE);
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

    const der = pemToDer(privateKeyPem);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      der,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false,
      ["decrypt"],
    );

    const encryptedKey = Uint8Array.from(
      atob(encryptedKeyB64),
      (c) => c.charCodeAt(0),
    );
    const decrypted = await crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      encryptedKey,
    );

    // @ts-ignore — Buffer compat
    return Buffer.from(decrypted);
  } catch {
    return null;
  }
}
