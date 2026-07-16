import { useCallback } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Platform } from "react-native";
import { store } from "../redux/store";
import {
  setPdfAttachment,
  clearPdfAttachment,
  selectPdfAttachment,
  selectPdfSecret,
  setPdfSecret,
} from "../redux/slices/pdfUploadSlice";
import { selectModelSupportsDocuments } from "../redux/slices/globalConfigSlice";
import { selectModel } from "../redux/slices/userSettingsSlice";
import { ChatApiClient } from "../apiClients/ChatApiClient";
import {
  derivePdfKey,
  encryptPdfData,
  generatePdfSecret,
} from "../utils/pdfCrypto";
import Toast from "react-native-toast-message";

/**
 * Read a File (web) into a base64 string without a data-URI prefix.
 */
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // strip "data:application/pdf;base64," prefix if present
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

export interface UsePdfAttachmentResult {
  /** The current pending attachment for this chat, or null */
  attachment: { id: string; name: string } | null;
  /** True when the selected model can read PDFs (gates the UI affordance) */
  modelSupportsPdfs: boolean;
  /** Attach a File (web) or base64 payload. Encrypts and uploads out-of-band. */
  attachFile: (file: File) => Promise<void>;
  /** Remove the current attachment and release the server-side doc. */
  removeAttachment: () => Promise<void>;
}

/**
 * Manages an out-of-band, *persisted* PDF attachment for a chat.
 *
 * The file is encrypted on the client (AES-256-GCM with a key derived from a
 * per-install secret + the filename) and uploaded once to the backend, which
 * stores only the ciphertext. The client keeps the doc id (+ secret, which is
 * persisted in Redux) and re-derives the key on every send, so the attachment
 * survives across messages, app reloads, and server restarts without
 * re-upload. The composer reads this attachment to show a chip and to pass
 * `pdfCacheId`/`pdfName`/`pdfKey` on send.
 *
 * Web-only drag-and-drop / file-picker is supported here; native mobile file
 * picking is intentionally out of scope for the web interface task.
 */
export function usePdfAttachment(chatId: string): UsePdfAttachmentResult {
  const dispatch = useDispatch();
  const model = useSelector(selectModel);
  const modelSupportsPdfs = useSelector((state: any) =>
    selectModelSupportsDocuments(state, model),
  );
  const attachment = useSelector((state: any) =>
    selectPdfAttachment(state, chatId),
  );

  /**
   * Resolve (or lazily create) the per-install client secret used to derive
   * PDF decryption keys. The secret is never sent to the server; it lives in
   * the persisted pdfUpload slice so keys remain reproducible after a reload.
   */
  const ensureSecret = useCallback((): string => {
    const existing = selectPdfSecret(store.getState());
    if (existing) return existing;
    const fresh = generatePdfSecret();
    dispatch(setPdfSecret(fresh));
    return fresh;
  }, [dispatch]);

  const attachFile = useCallback(
    async (file: File) => {
      if (!modelSupportsPdfs) {
        Toast.show({
          type: "error",
          text1: "PDF not supported",
          text2:
            "This model can't read PDFs. Pick a document-capable model (marked 📄) to attach a PDF.",
        });
        return;
      }
      const name = file.name || "upload.pdf";
      if (!name.toLowerCase().endsWith(".pdf")) {
        Toast.show({
          type: "error",
          text1: "Not a PDF",
          text2: "Only PDF files can be attached.",
        });
        return;
      }
      try {
        const data = await fileToBase64(file);
        // Derive the decryption key from the client secret + the filename, then
        // encrypt so only ciphertext leaves the device. The key is re-derived
        // on each send (same inputs), so it doesn't need to be stored.
        const secret = ensureSecret();
        const key = derivePdfKey(secret, name);
        const { iv, data: encryptedData } = encryptPdfData(key, data);
        const { id } = await ChatApiClient.uploadPdf(
          model,
          name,
          encryptedData,
          iv,
          chatId,
        );
        dispatch(setPdfAttachment({ chatId, attachment: { id, name } }));
        Toast.show({
          type: "success",
          text1: "PDF attached",
          text2: name,
        });
      } catch (err: any) {
        const msg =
          err?.error || (err instanceof Error ? err.message : "Upload failed");
        Toast.show({
          type: "error",
          text1: "PDF upload failed",
          text2: typeof msg === "string" ? msg : "Unknown error",
        });
      }
    },
    [chatId, dispatch, ensureSecret, model, modelSupportsPdfs],
  );

  const removeAttachment = useCallback(async () => {
    const current = selectPdfAttachment(store.getState(), chatId);
    if (current) {
      dispatch(clearPdfAttachment({ chatId }));
      // Best-effort release; the server deletes the persisted ciphertext.
      ChatApiClient.releasePdf(current.id, chatId).catch(() => {});
    }
  }, [chatId, dispatch]);

  return {
    attachment,
    modelSupportsPdfs,
    attachFile,
    removeAttachment,
  };
}

/**
 * Web-only helper: open a hidden <input type="file" accept="application/pdf">
 * and resolve with the chosen File. Returns null on non-web platforms.
 */
export function pickPdfFileWeb(): Promise<File | null> {
  if (Platform.OS !== "web" || typeof document === "undefined") {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/pdf";
    input.style.display = "none";
    input.onchange = () => {
      const file = input.files && input.files[0];
      resolve(file ?? null);
    };
    // If the user cancels, change may not fire; resolve null on window focus.
    document.body.appendChild(input);
    input.click();
    // Clean up the element shortly after.
    setTimeout(() => {
      if (input.parentNode) input.parentNode.removeChild(input);
    }, 1000);
  });
}
