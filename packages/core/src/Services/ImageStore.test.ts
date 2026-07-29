/**
 * End-to-end tests for the generated-image pipeline.
 *
 * These cover the three properties the feature has to guarantee:
 *  1. the image is stored encrypted (plaintext never hits disk),
 *  2. it can actually be decrypted back into the original bytes
 *     (i.e. a real image renders, not a corrupt blob),
 *  3. no base64 / key material can leak into the LLM context window.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";

import {
  storeEncryptedImage,
  storeAsymmetricallyEncryptedImage,
  getEncryptedImage,
  validatePublicKeyPem,
  hasEncryptedImage,
  removeEncryptedImage,
} from "./ImageStore";
import {
  extractImageRefs,
  buildImageMarkdown,
  summarizeImageToolResult,
  stripTogoderRefs,
  hasInlineImageData,
} from "./ImageSanitizer";

const TAG_LEN = 16;

/** A small but real PNG so we can assert the magic bytes survive. */
const PNG_BYTES = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100" +
    "05fe02fa0000000049454e44ae426082",
  "hex",
);

let tmpDir: string;
let prevDir: string | undefined;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "imgstore-"));
  prevDir = process.env.IMAGE_STORE_DIR;
  process.env.IMAGE_STORE_DIR = tmpDir;
});

afterEach(() => {
  if (prevDir === undefined) delete process.env.IMAGE_STORE_DIR;
  else process.env.IMAGE_STORE_DIR = prevDir;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

/** Mirror of the client's symmetric decrypt (node crypto stands in for @noble). */
function decrypt(keyB64: string, ivB64: string, blob: Buffer): Buffer {
  const key = Buffer.from(keyB64, "base64");
  const iv = Buffer.from(ivB64, "base64");
  const ct = blob.subarray(0, blob.length - TAG_LEN);
  const tag = blob.subarray(blob.length - TAG_LEN);
  const d = crypto.createDecipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_LEN,
  });
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

describe("ImageStore — symmetric", () => {
  it("round-trips to the exact original image bytes", async () => {
    const meta = storeEncryptedImage(PNG_BYTES.toString("base64"));
    const payload = await getEncryptedImage(meta.id);
    expect(payload).not.toBeNull();

    const plain = decrypt(meta.key, meta.iv, payload!.data);
    expect(plain.equals(PNG_BYTES)).toBe(true);
    // Real, renderable PNG magic bytes.
    expect(plain.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  });

  it("never writes plaintext to disk", () => {
    const meta = storeEncryptedImage(PNG_BYTES.toString("base64"));
    const blob = fs.readFileSync(path.join(tmpDir, `${meta.id}.bin`));
    expect(blob.includes(PNG_BYTES)).toBe(false);
    expect(blob.subarray(0, 8).toString("hex")).not.toBe("89504e470d0a1a0a");
  });

  it("fails authentication if the ciphertext is tampered with", async () => {
    const meta = storeEncryptedImage(PNG_BYTES.toString("base64"));
    const p = path.join(tmpDir, `${meta.id}.bin`);
    const blob = fs.readFileSync(p);
    blob[0] ^= 0xff;
    fs.writeFileSync(p, blob);
    const payload = await getEncryptedImage(meta.id);
    expect(() => decrypt(meta.key, meta.iv, payload!.data)).toThrow();
  });
});

describe("ImageStore — asymmetric (server cannot decrypt)", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  it("round-trips only via the client's private key", async () => {
    const meta = storeAsymmetricallyEncryptedImage(
      PNG_BYTES.toString("base64"),
      publicKey,
    );
    expect(meta.scheme).toBe("rsa");
    // The stored key is RSA-wrapped, so it is NOT a usable 32-byte AES key.
    expect(Buffer.from(meta.key, "base64").length).toBe(256);

    const payload = await getEncryptedImage(meta.id);
    const aesKey = crypto.privateDecrypt(
      {
        key: privateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: "sha256",
      },
      Buffer.from(meta.key, "base64"),
    );
    expect(aesKey.length).toBe(32);

    const plain = decrypt(aesKey.toString("base64"), meta.iv, payload!.data);
    expect(plain.equals(PNG_BYTES)).toBe(true);
  });

  it("records a pubkey hash the blob endpoint can verify", () => {
    const meta = storeAsymmetricallyEncryptedImage(
      PNG_BYTES.toString("base64"),
      publicKey,
    );
    expect(meta.pubkeyHash).toBe(validatePublicKeyPem(publicKey));
    expect(validatePublicKeyPem("not a key")).toBeNull();
  });
});

describe("ImageStore — lifecycle", () => {
  it("reports existence and deletes both files", async () => {
    const meta = storeEncryptedImage(PNG_BYTES.toString("base64"));
    expect(hasEncryptedImage(meta.id)).toBe(true);
    removeEncryptedImage(meta.id);
    expect(hasEncryptedImage(meta.id)).toBe(false);
    expect(await getEncryptedImage(meta.id)).toBeNull();
  });

  it("rejects path-traversal ids instead of reading outside the store", () => {
    expect(hasEncryptedImage("../../etc/passwd")).toBe(false);
  });
});

describe("LLM context safety", () => {
  const ref =
    "togoder-image://b9f3a01695ba596219fd6634fa20ca9e" +
    "?key=AAAA&iv=BBBB&scheme=rsa";

  it("dedupes refs so one image is not rendered twice", () => {
    // A real tool result names the ref in both `imageRef` and `markdown`.
    const toolResult = JSON.stringify({
      images: [{ imageRef: ref, markdown: `![Generated image 1](${ref})` }],
    });
    expect(extractImageRefs(toolResult)).toEqual([ref]);
    expect(buildImageMarkdown(extractImageRefs(toolResult))).toBe(
      `![Generated image 1](${ref})`,
    );
  });

  it("hands the model a summary containing no key or IV material", () => {
    const summary = summarizeImageToolResult(1);
    expect(summary).not.toContain("togoder-image://");
    expect(summary).not.toContain("key=");
    expect(summary).not.toContain("iv=");
    expect(JSON.parse(summary).count).toBe(1);
    // Must not be huge — this is the whole point of the ref indirection.
    expect(summary.length).toBeLessThan(500);
  });

  it("keeps history free of refs when replayed to the model", () => {
    const stripped = stripTogoderRefs(`Here it is: ![img](${ref})`);
    expect(stripped).not.toContain("togoder-image://");
    expect(stripped).not.toContain("key=");
  });

  it("detects inline base64 reliably on repeated calls", () => {
    const withB64 = "![x](data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==)";
    // Regression: the /g flag made .test() alternate true/false.
    for (let i = 0; i < 4; i++) {
      expect(hasInlineImageData(withB64)).toBe(true);
    }
    for (let i = 0; i < 4; i++) {
      expect(hasInlineImageData("no images here")).toBe(false);
    }
  });
});
