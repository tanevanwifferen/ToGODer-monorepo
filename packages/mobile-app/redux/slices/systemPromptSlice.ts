import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";

// Redux slice for managing custom system prompts
// Stores generated system prompts and provides actions to update them
export interface SystemPromptState {
  customSystemPrompt: string | null;
  isGenerating: boolean;
  lastGenerated: string | null; // ISO timestamp
  error: string | null;
}

const initialState: SystemPromptState = {
  customSystemPrompt: null,
  isGenerating: false,
  lastGenerated: null,
  error: null,
};

const systemPromptSlice = createSlice({
  name: "systemPrompt",
  initialState,
  reducers: {
    setCustomSystemPrompt: (state, action: PayloadAction<string>) => {
      state.customSystemPrompt = action.payload;
      state.lastGenerated = new Date().toISOString();
      state.error = null;
    },
    setGenerating: (state, action: PayloadAction<boolean>) => {
      state.isGenerating = action.payload;
      if (action.payload) {
        state.error = null;
      }
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isGenerating = false;
    },
    clearCustomSystemPrompt: (state) => {
      state.customSystemPrompt = null;
      state.lastGenerated = null;
      state.error = null;
    },
  },
});

export const { 
  setCustomSystemPrompt, 
  setGenerating, 
  setError, 
  clearCustomSystemPrompt 
} = systemPromptSlice.actions;

// Selectors for accessing system prompt state
export const selectCustomSystemPrompt = createSelector(
  (state: { systemPrompt: SystemPromptState }) => state.systemPrompt,
  (systemPrompt) => systemPrompt.customSystemPrompt
);

export const selectIsGeneratingSystemPrompt = createSelector(
  (state: { systemPrompt: SystemPromptState }) => state.systemPrompt,
  (systemPrompt) => systemPrompt.isGenerating
);

export const selectSystemPromptError = createSelector(
  (state: { systemPrompt: SystemPromptState }) => state.systemPrompt,
  (systemPrompt) => systemPrompt.error
);

export const selectSystemPromptLastGenerated = createSelector(
  (state: { systemPrompt: SystemPromptState }) => state.systemPrompt,
  (systemPrompt) => systemPrompt.lastGenerated
);

export default systemPromptSlice.reducer;