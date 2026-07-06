import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { SentimentSummary } from "../../model/Sentiment";
import { RootState } from "../store";

/**
 * Latest sentiment summary per chat, as streamed by the backend alongside
 * chat responses (or fetched from /api/sentiment). Not persisted: replaying
 * an analysis is free server-side, so a fresh fetch is cheaper than stale
 * persisted data.
 */
export interface SentimentState {
  byChatId: Record<string, SentimentSummary>;
  isLoading: boolean;
}

const initialState: SentimentState = {
  byChatId: {},
  isLoading: false,
};

const sentimentSlice = createSlice({
  name: "sentiment",
  initialState,
  reducers: {
    setSentiment: (
      state,
      action: PayloadAction<{ chatId: string; sentiment: SentimentSummary }>
    ) => {
      state.byChatId[action.payload.chatId] = action.payload.sentiment;
    },
    setSentimentLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    clearSentiment: (state, action: PayloadAction<{ chatId: string }>) => {
      delete state.byChatId[action.payload.chatId];
    },
  },
});

export const { setSentiment, setSentimentLoading, clearSentiment } =
  sentimentSlice.actions;

export const selectSentimentForChat =
  (chatId: string) =>
  (state: RootState): SentimentSummary | undefined =>
    state.sentiment?.byChatId?.[chatId];

export const selectSentimentLoading = (state: RootState): boolean =>
  state.sentiment?.isLoading ?? false;

export default sentimentSlice.reducer;
