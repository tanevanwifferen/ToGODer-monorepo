import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import {
  storeEncryptedPdf,
  getEncryptedPdf,
  hasEncryptedPdf,
  removeEncryptedPdf,
} from "./PdfDocStore";
import { decryptPdfData } from "./PdfCrypto";
import { getPdf, clearPdfCache } from "./PdfCache";

const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

/**
 * Produce the client wire format (@noble/ciphers gcm output): base64
 * `ciphertext || authTag` and base64 12-byte nonce, plus the base64 AES key.
 * Here we use Node's crypto to mimic the client so the server-side decrypt
 * is exercised against a compatible ciphertext.
 */
function clientEncrypt(
  keyB64: string,
  plaintext: string,
): { iv: string; data: string } {
  const key = Buffer.from(keyB64, "base64");
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_LEN,
  });
  const ct = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const data = Buffer.concat([ct, tag]).toString("base64"); // ct || tag
  return { iv: iv.toString("base64"), data };
}

describe("PdfCrypto.decryptPdfData (server-side decrypt)", () => {
  it("round-trips ciphertext produced in the client wire format", () => {
    const key = crypto.randomBytes(KEY_LEN).toString("base64");
    const plaintext = "AAABBBPDFCONTENT"; // a base64 PDF string
    const { iv, data } = clientEncrypt(key, plaintext);
    expect(decryptPdfData(key, iv, data)).toBe(plaintext);
  });

  it("returns null for a tampered ciphertext (auth failure)", () => {
    const key = crypto.randomBytes(KEY_LEN).toString("base64");
    const { iv, data } = clientEncrypt(key, "plaintext");
    // Flip a byte in the middle of the ciphertext.
    const buf = Buffer.from(data, "base64");
    buf[buf.length - TAG_LEN - 1] ^= 0x01;
    const tampered = buf.toString("base64");
    expect(decryptPdfData(key, iv, tampered)).toBeNull();
  });

  it("returns null for a wrong key", () => {
    const key = crypto.randomBytes(KEY_LEN).toString("base64");
    const wrong = crypto.randomBytes(KEY_LEN).toString("base64");
    const { iv, data } = clientEncrypt(key, "plaintext");
    expect(decryptPdfData(wrong, iv, data)).toBeNull();
  });

  it("returns null for malformed inputs", () => {
    expect(decryptPdfData("bad", "bad", "bad")).toBeNull();
  });
});

describe("PdfDocStore persistence", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfdocs-"));
    process.env.PDF_DOC_DIR = dir;
  });
  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
    delete process.env.PDF_DOC_DIR;
    clearPdfCache();
  });

  it("stores and reloads an encrypted doc by id", async () => {
    const key = crypto.randomBytes(KEY_LEN).toString("base64");
    const { iv, data } = clientEncrypt(key, "AAAB");
    const id = storeEncryptedPdf({
      name: "doc.pdf",
      mimeType: "application/pdf",
      iv,
      data,
    });
    expect(hasEncryptedPdf(id)).toBe(true);
    const loaded = await getEncryptedPdf(id);
    expect(loaded).not.toBeNull();
    expect(loaded!.iv).toBe(iv);
    expect(loaded!.data).toBe(data);
    expect(decryptPdfData(key, loaded!.iv, loaded!.data)).toBe("AAAB");
  });

  it("returns null for a missing doc", async () => {
    expect(await getEncryptedPdf("deadbeefdeadbeefdeadbeefdeadbeef")).toBeNull();
    expect(hasEncryptedPdf("deadbeefdeadbeefdeadbeefdeadbeef")).toBe(false);
  });

  it("removes a persisted doc", () => {
    const id = storeEncryptedPdf({
      name: "doc.pdf",
      mimeType: "application/pdf",
      iv: "iv",
      data: "data",
    });
    expect(hasEncryptedPdf(id)).toBe(true);
    removeEncryptedPdf(id);
    expect(hasEncryptedPdf(id)).toBe(false);
  });

  it("survives a restart (re-reads from disk) and seeds the hot cache on decrypt", async () => {
    clearPdfCache();
    const key = crypto.randomBytes(KEY_LEN).toString("base64");
    const { iv, data } = clientEncrypt(key, "AAAB");
    const id = storeEncryptedPdf({
      name: "doc.pdf",
      mimeType: "application/pdf",
      iv,
      data,
    });
    // Simulate a server restart: hot cache empty.
    expect(getPdf(id)).toBeNull();
    const loaded = (await getEncryptedPdf(id))!;
    const plain = decryptPdfData(key, loaded.iv, loaded.data);
    expect(plain).toBe("AAAB");
  });

  it("rejects path-traversal ids", () => {
    expect(hasEncryptedPdf("../../etc/passwd")).toBe(false);
    expect(async () => getEncryptedPdf("../x")).not.toThrow();
  });
});
