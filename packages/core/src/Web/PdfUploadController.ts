import { Request, Response, NextFunction, Router } from "express";
import { setAuthUser } from "./Middleware/auth";
import { ToGODerRequest } from "./Model/ToGODerRequest";
import { modelSupportsDocuments } from "../LLM/Model/AIProvider";
import { storePdf, releasePdf, getPdf } from "../Services/PdfCache";
import {
  storeEncryptedPdf,
  hasEncryptedPdf,
  removeEncryptedPdf,
} from "../Services/PdfDocStore";

/**
 * PDF upload controller.
 *
 * Clients upload a PDF once to `POST /api/chat/pdf` and receive an opaque
 * cache id. The id is the only thing carried in subsequent ChatRequests
 * (as `pdfCacheId`), so the conversation/message payload never embeds the
 * PDF bytes — they live out-of-band in the in-memory PdfCache and are
 * resolved by the backend at send time.
 *
 * Only document-capable models accept uploads (the capability is verified
 * here before caching, and again in the chat pipeline). Non-capable models
 * are rejected with 400 so the client can surface the error.
 *
 * The cache is process-local and ref-counted per chat: a PDF stays cached
 * while a chat references it and is evicted once released (or via the
 * cache's TTL/size eviction). Uploads are not persisted to the database or
 * conversation history.
 */

const MAX_PDF_BYTES = 25 * 1024 * 1024; // 25 MB uploaded PDF

function isPdfUploadValid(
  model: string,
  name: string,
  data: string,
): string | null {
  if (!model) return "model is required";
  if (!name) return "filename is required";
  if (!data) return "file data is required";
  // Reject obvious non-PDFs early. The MIME check is best-effort; the real
  // gating is the model's document capability.
  if (!name.toLowerCase().endsWith(".pdf")) {
    return "only PDF files are supported";
  }
  // base64 size: 25MB raw -> ~33MB base64 (ciphertext is ~same length)
  if (data.length > (MAX_PDF_BYTES * 4) / 3 + 1024) {
    return `PDF too large (max ${Math.floor(MAX_PDF_BYTES / (1024 * 1024))}MB)`;
  }
  return null;
}

export function GetPdfUploadRouter(): Router {
  const router = Router();

  /**
   * Upload a PDF for a document-capable model. Returns `{ id, name }` where
   * `id` is the opaque document id to send as `pdfCacheId` in /api/chat(/stream).
   *
   * Two forms are accepted:
   *  - Encrypted (preferred): `{ model, name, encryptedData, iv, chatId? }`
   *    where `encryptedData` is base64 `ciphertext || authTag` and `iv` is the
   *    base64 12-byte GCM nonce. The server persists only the ciphertext to
   *    disk (PdfDocStore); the client keeps the decryption key and sends it
   *    per request as `pdfKey`. The PDF then persists across messages.
   *  - Legacy plaintext: `{ model, name, data, chatId? }` with base64 content.
   *    Stored in the in-memory PdfCache only (not persisted across restarts).
   */
  router.post(
    "/api/chat/pdf",
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { model, name, data, encryptedData, iv, chatId } = req.body ?? {};

        // Gate: only document-capable models accept PDF uploads. This is
        // re-checked in the chat pipeline, but rejecting here gives the
        // client immediate feedback before a send is attempted.
        if (!(await modelSupportsDocuments(model as any))) {
          res.status(400).json({
            error:
              "The selected model does not support PDF documents. Please choose a document-capable model (marked 📄) to upload a PDF.",
          });
          return;
        }

        // Encrypted (persisted) path: the server keeps ciphertext + nonce on
        // disk; only the client can derive the key to read it.
        if (encryptedData && iv) {
          const validationError = isPdfUploadValid(model, name, encryptedData);
          if (validationError) {
            res.status(400).json({ error: validationError });
            return;
          }
          const id = storeEncryptedPdf({
            name,
            mimeType: "application/pdf",
            iv,
            data: encryptedData,
          });
          res.json({ id, name });
          return;
        }

        // Legacy plaintext path: in-memory hot cache only.
        const validationError = isPdfUploadValid(model, name, data);
        if (validationError) {
          res.status(400).json({ error: validationError });
          return;
        }

        const id = storePdf(
          { name, mimeType: "application/pdf", data },
          chatId,
        );
        res.json({ id, name });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Release a chat's reference to a cached PDF so it can be evicted. Called
   * when the client clears/removes the attachment or the chat is cleared.
   *
   * Body: { id: string, chatId: string }
   */
  router.post(
    "/api/chat/pdf/release",
    setAuthUser,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id, chatId } = req.body ?? {};
        if (!id || !chatId) {
          res.status(400).json({ error: "id and chatId are required" });
          return;
        }
        releasePdf(id, chatId);
        // Also drop the persisted (encrypted) doc so the upload is fully gone
        // when the user removes the attachment or clears the chat.
        removeEncryptedPdf(id);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    },
  );

  /**
   * Peek at a cached PDF's metadata (without bumping the ref count). Lets the
   * client verify an id is still valid before sending (e.g. after a reload).
   * Never returns the bytes.
   *
   * Query: ?id=<cacheId>
   */
  router.get(
    "/api/chat/pdf",
    setAuthUser,
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = String(req.query.id ?? "");
        let cached = id ? getPdf(id) : null;
        // Fall back to the persisted encrypted doc so a peek still validates an
        // id after a server restart (hot cache is empty then).
        if (!cached && id && hasEncryptedPdf(id)) {
          cached = { id, name: "" } as any;
        }
        if (!cached) {
          res.status(404).json({ error: "PDF not found or expired" });
          return;
        }
        res.json({ id: cached.id, name: cached.name });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
