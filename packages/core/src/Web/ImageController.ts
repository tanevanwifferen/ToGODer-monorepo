import { Request, Response, NextFunction, Router } from "express";
import { getEncryptedImage } from "../Services/ImageStore";

/**
 * Image retrieval controller.
 *
 * Generated images are stored encrypted on a bind-mount volume; only a
 * compact reference token (togoder-image://<id>?key=...&iv=...) is kept
 * in the chat history. The client detects these tokens, fetches the
 * ciphertext from GET /api/chat/image/:id, and decrypts it client-side
 * using the key and nonce embedded in the reference token (never sent
 * to this endpoint).
 *
 * The endpoint returns the raw encrypted binary so the client can
 * decrypt it. No auth is required — the blob is useless without the key.
 */

export function GetImageRouter(): Router {
  const router = Router();

  /**
   * GET /api/chat/image/:id
   *
   * Returns the encrypted image binary (ciphertext || authTag) as
   * `application/octet-stream`. The client already has the AES-256-GCM
   * key and nonce from the reference token in the chat history.
   *
   * Response headers include Cache-Control for CDN/proxy friendliness
   * (images are immutable once generated).
   */
  router.get(
    "/api/chat/image/:id",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = req.params.id;

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

        res
          .status(200)
          .set({
            "Content-Type": "application/octet-stream",
            "Content-Length": payload.data.length.toString(),
            "Cache-Control": "public, max-age=31536000, immutable",
          })
          .send(payload.data);
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
