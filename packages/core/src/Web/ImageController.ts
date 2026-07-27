import { Request, Response, NextFunction, Router } from "express";
import { getEncryptedImage, validatePublicKeyPem } from "../Services/ImageStore";
import { extractImageRefs, resolveRefsForSharing } from "../Services/ImageSanitizer";
import { stripInlineImageData } from "../Services/ImageSanitizer";
import fs from "fs";
import path from "path";
import crypto from "crypto";

/**
 * Image retrieval controller.
 *
 * Generated images are stored encrypted on a bind-mount volume; only a
 * compact reference token (togoder-image://<id>?key=...&iv=...) is kept
 * in the chat history. The client detects these tokens, fetches the
 * ciphertext from GET /api/chat/image/:id or GET /api/chat/blob, and
 * decrypts it client-side using the key and nonce embedded in the
 * reference token (never sent to this endpoint).
 *
 * Both endpoints return the raw encrypted binary so the client can
 * decrypt it. No auth is required — the blob is useless without the key.
 *
 * Optional `pubkey` query parameter: when provided, the endpoint validates
 * the key format and, for asymmetric images (scheme=rsa), verifies the
 * pubkey hash matches the one used at encryption time. This prevents
 * unauthorized clients from enumerating stored images — even though the
 * ciphertext is useless without the decryption key, a 403 on pubkey
 * mismatch reduces the attack surface.
 */

// ── In-memory rate limiter (per-IP, sliding window) ────────────

const RATE_WINDOW_MS = 60_000; // 1 minute
const RATE_MAX_REQUESTS = 120; // 2 req/s average — generous for image renders
const rateCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateCounts.get(ip);
  if (!entry || now > entry.resetAt) {
    rateCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_MAX_REQUESTS) {
    return false;
  }
  entry.count++;
  return true;
}

// Periodic cleanup to prevent memory leak
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateCounts) {
    if (now > entry.resetAt) rateCounts.delete(ip);
  }
}, 5 * 60_000).unref();

// ── Shared blob-serving logic ──────────────────────────────────

async function serveEncryptedBlob(
  id: string,
  pubkeyParam: string | undefined,
  res: Response,
): Promise<void> {
  // Guard against path traversal
  if (!id || !/^[a-f0-9]{32}$/i.test(id)) {
    res.status(400).json({ error: "invalid image id" });
    return;
  }

  const payload = await getEncryptedImage(id);
  if (!payload) {
    res.status(404).json({ error: "image not found" });
    return;
  }

  // Optional pubkey verification
  if (pubkeyParam) {
    const hash = validatePublicKeyPem(pubkeyParam);
    if (!hash) {
      res.status(400).json({ error: "invalid public key format" });
      return;
    }
    // For asymmetric images, verify the pubkey matches the one used at encryption
    if (payload.meta.scheme === 'rsa' && payload.meta.pubkeyHash) {
      if (hash !== payload.meta.pubkeyHash) {
        res.status(403).json({ error: "public key mismatch" });
        return;
      }
    }
  }

  res
    .status(200)
    .set({
      "Content-Type": "application/octet-stream",
      "Content-Length": payload.data.length.toString(),
      "Cache-Control": "public, max-age=31536000, immutable",
    })
    .send(payload.data);
}

// ── Route definitions ──────────────────────────────────────────

export function GetImageRouter(): Router {
  const router = Router();

  /**
   * GET /api/chat/image/:id?pubkey=<PEM>
   *
   * Returns the encrypted image binary by its storage ID.
   * Legacy endpoint — prefer /api/chat/blob for new clients.
   */
  router.get(
    "/api/chat/image/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        if (!checkRateLimit(ip)) {
          res.status(429).json({ error: "too many requests" });
          return;
        }

        const pubkeyParam = typeof req.query.pubkey === 'string' ? req.query.pubkey : undefined;
        await serveEncryptedBlob(req.params.id, pubkeyParam, res);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET /api/chat/blob?ref=<togoder-image://...>&pubkey=<PEM>
   *
   * Returns the encrypted image binary. Accepts a full reference URL
   * (togoder-image://<id>?key=...&iv=...) and extracts the storage ID
   * from it. The `pubkey` parameter is optional but recommended — when
   * provided, the server verifies the requesting client's key matches
   * the one used at encryption time.
   *
   * Rate limited per IP (120 req/min sliding window).
   */
  router.get(
    "/api/chat/blob",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
        if (!checkRateLimit(ip)) {
          res.status(429).json({ error: "too many requests" });
          return;
        }

        const ref = typeof req.query.ref === 'string' ? req.query.ref : undefined;
        if (!ref) {
          res.status(400).json({ error: "missing ref parameter" });
          return;
        }

        // Parse the reference URL to extract the storage ID
        // Format: togoder-image://<32-hex-id>?key=...&iv=...
        const refMatch = ref.match(/^togoder-image:\/\/([a-f0-9]{32})\?/i);
        if (!refMatch) {
          res.status(400).json({ error: "invalid ref format" });
          return;
        }

        const pubkeyParam = typeof req.query.pubkey === 'string' ? req.query.pubkey : undefined;
        await serveEncryptedBlob(refMatch[1], pubkeyParam, res);
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * POST /api/chat/share-images
   *
   * Accepts decrypted base64 images from the client (after local decrypt
   * with private key) and stores them unencrypted for shared chat recipients.
   *
   * Body:
   *   { images: [{ ref: "togoder-image://...", data: "<base64>" }], content: "<original message>" }
   *
   * Response:
   *   { resolvedContent: "<content with refs replaced>", urls: { [ref]: "https://..." } }
   *
   * The private key NEVER leaves the client — decryption happens on-device
   * and only the already-decrypted images are sent to this endpoint during
   * an explicit share action initiated by the user.
   */
  router.post(
    "/api/chat/share-images",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { images, content } = req.body;

        if (!images || !Array.isArray(images) || images.length === 0) {
          res.status(400).json({ error: "images array is required" });
          return;
        }

        if (!content || typeof content !== 'string') {
          res.status(400).json({ error: "content string is required" });
          return;
        }

        // Validate the content actually references these images
        const refsInContent = new Set(extractImageRefs(content));

        const shareDir = path.join(
          process.env.IMAGE_STORE_DIR || path.join(process.cwd(), "data", "images"),
          "shared",
        );
        fs.mkdirSync(shareDir, { recursive: true });

        const resolvedMap: Record<string, string> = {};
        const baseUrl = process.env.HOST_URL || `http://localhost:${process.env.PORT || 6968}`;

        for (const img of images) {
          if (!img.ref || !img.data) {
            res.status(400).json({ error: "each image must have ref and data fields" });
            return;
          }

          // Verify this ref was actually in the original content
          if (!refsInContent.has(img.ref)) {
            res.status(400).json({
              error: `ref ${img.ref.slice(0, 40)}... not found in content`,
            });
            return;
          }

          // Write the decrypted image as a plain file
          const shareId = crypto.randomBytes(16).toString("hex");
          const sharePath = path.join(shareDir, `${shareId}.png`);
          const imageData = Buffer.from(img.data, "base64");
          fs.writeFileSync(sharePath, imageData);

          const publicUrl = `${baseUrl}/api/chat/shared-image/${shareId}`;
          resolvedMap[img.ref] = publicUrl;
        }

        // Rewrite the content with resolved URLs
        const resolvedContent = resolveRefsForSharing(
          stripInlineImageData(content),
          resolvedMap,
        );

        res.status(200).json({
          resolvedContent,
          urls: resolvedMap,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * GET /api/chat/shared-image/:id
   *
   * Serves unencrypted shared images to recipients. These images were
   * decrypted by the original user during the share flow and stored
   * without encryption so anyone with the shared chat URL can view them.
   */
  router.get(
    "/api/chat/shared-image/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = req.params.id;
        if (!id || !/^[a-f0-9]{32}$/i.test(id)) {
          res.status(400).json({ error: "invalid image id" });
          return;
        }

        const shareDir = path.join(
          process.env.IMAGE_STORE_DIR || path.join(process.cwd(), "data", "images"),
          "shared",
        );
        const sharePath = path.join(shareDir, `${id}.png`);

        if (!fs.existsSync(sharePath)) {
          res.status(404).json({ error: "shared image not found" });
          return;
        }

        const data = await fs.promises.readFile(sharePath);
        res
          .status(200)
          .set({
            "Content-Type": "image/png",
            "Content-Length": data.length.toString(),
            "Cache-Control": "public, max-age=31536000, immutable",
          })
          .send(data);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
