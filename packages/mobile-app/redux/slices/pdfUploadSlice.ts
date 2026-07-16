import { createSlice, createSelector, PayloadAction } from "@reduxjs/toolkit";

/**
 * Out-of-band PDF attachment state, keyed by chatId.
 *
 * Each chat may hold at most one pending PDF upload. The slice stores ONLY
 * the opaque server cache id and the filename — never the file bytes — so
 * the persisted conversation history and message requests stay small. The
 * actual bytes live in the backend's in-memory PdfCache (uploaded once via
 * POST /api/chat/pdf) and are resolved server-side at send time.
 *
 * This slice is intentionally NOT persisted: an attachment is an ephemeral
 * in-flight upload for the current chat, not part of the conversation.
 */

export interface PdfAttachment {
  /** Opaque cache id returned by POST /api/chat/pdf */
  id: string;
  /** Original filename (shown in the UI, used as the file_data filename) */
  name: string;
}

export interface PdfUploadState {
  /** chatId -> attachment */
  byChat: Record<string, PdfAttachment>;
}

const initialState: PdfUploadState = {
  byChat: {},
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
  },
});

export const { setPdfAttachment, clearPdfAttachment } = pdfUploadSlice.actions;

export const selectPdfAttachment = createSelector(
  [
    (state: { pdfUpload: PdfUploadState }) => state.pdfUpload,
    (_state: any, chatId: string) => chatId,
  ],
  (pdfUpload, chatId) => pdfUpload.byChat[chatId] ?? null,
);

export default pdfUploadSlice.reducer;
