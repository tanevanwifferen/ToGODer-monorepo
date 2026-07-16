import { createSlice, createSelector, PayloadAction } from "@reduxjs/toolkit";

/**
 * Out-of-band PDF attachment state, keyed by chatId.
 *
 * Each chat may hold at most one PDF attachment. The slice stores ONLY the
 * opaque server document id and the filename — never the file bytes, and never
 * the decryption key (the key is re-derived on each send from the client
 * `secret` + the filename, so it never needs to be persisted). The actual
 * bytes live on the server as *ciphertext* (PdfDocStore); the client keeps the
 * secret needed to derive the key, so only the client can read the PDF.
 *
 * The slice IS persisted (added to the redux-persist whitelist) so a PDF
 * attachment survives across messages, app reloads, and server restarts
 * without re-upload. The server keeps the ciphertext on disk; the client
 * re-derives the key on send.
 */

export interface PdfAttachment {
  /** Opaque document id returned by POST /api/chat/pdf */
  id: string;
  /** Original filename (shown in the UI, used to re-derive the key) */
  name: string;
}

export interface PdfUploadState {
  /** chatId -> attachment */
  byChat: Record<string, PdfAttachment>;
  /**
   * Per-install client secret (base64) used to derive PDF decryption keys.
   * Generated lazily on first attach; never sent to the server. Kept here so
   * keys can be re-derived reproducibly after a reload.
   */
  secret: string | null;
}

const initialState: PdfUploadState = {
  byChat: {},
  secret: null,
};

const pdfUploadSlice = createSlice({
  name: "pdfUpload",
  initialState,
  reducers: {
    setPdfAttachment(
      state,
      action: PayloadAction<{ chatId: string; attachment: PdfAttachment }>,
    ) {
      state.byChat[action.payload.chatId] = action.payload.attachment;
    },
    clearPdfAttachment(state, action: PayloadAction<{ chatId: string }>) {
      delete state.byChat[action.payload.chatId];
    },
    /** Set (or initialize) the per-install client secret used to derive keys. */
    setPdfSecret(state, action: PayloadAction<string>) {
      state.secret = action.payload;
    },
  },
});

export const {
  setPdfAttachment,
  clearPdfAttachment,
  setPdfSecret,
} = pdfUploadSlice.actions;

export const selectPdfAttachment = createSelector(
  [
    (state: { pdfUpload: PdfUploadState }) => state.pdfUpload,
    (_state: any, chatId: string) => chatId,
  ],
  (pdfUpload, chatId) => pdfUpload.byChat[chatId] ?? null,
);

export const selectPdfSecret = createSelector(
  [(state: { pdfUpload: PdfUploadState }) => state.pdfUpload],
  (pdfUpload) => pdfUpload.secret,
);

export default pdfUploadSlice.reducer;
