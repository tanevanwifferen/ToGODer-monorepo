import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface ChatUIState {
  // Input and interaction state
  isInputFocused: boolean;
  keyboardHeight: number;

  // Message selection and editing
  selectedMessageIndices: number[];
  editingMessageIndex: number | null;

  // Scroll behavior
  autoScrollEnabled: boolean;

  // UI visibility toggles
  isSettingsModalVisible: boolean;
  isInfoPanelVisible: boolean;

  // Loading and error states for UI operations
  isUILoading: boolean;
  uiError: string | null;
}

const initialState: ChatUIState = {
  isInputFocused: false,
  keyboardHeight: 0,
  selectedMessageIndices: [],
  editingMessageIndex: null,
  autoScrollEnabled: true,
  isSettingsModalVisible: false,
  isInfoPanelVisible: false,
  isUILoading: false,
  uiError: null,
};

const chatUISlice = createSlice({
  name: "chatUI",
  initialState,
  reducers: {
    // Input focus management
    setInputFocused: (state, action: PayloadAction<boolean>) => {
      state.isInputFocused = action.payload;
    },
    setKeyboardHeight: (state, action: PayloadAction<number>) => {
      state.keyboardHeight = action.payload;
    },

    // Message selection
    toggleMessageSelection: (state, action: PayloadAction<number>) => {
      const index = action.payload;
      const existingIndex = state.selectedMessageIndices.indexOf(index);
      if (existingIndex >= 0) {
        state.selectedMessageIndices.splice(existingIndex, 1);
      } else {
        state.selectedMessageIndices.push(index);
      }
    },
    setSelectedMessages: (state, action: PayloadAction<number[]>) => {
      state.selectedMessageIndices = action.payload;
    },
    clearMessageSelection: (state) => {
      state.selectedMessageIndices = [];
    },

    // Message editing
    setEditingMessage: (state, action: PayloadAction<number | null>) => {
      state.editingMessageIndex = action.payload;
    },

    // Scroll behavior
    setAutoScrollEnabled: (state, action: PayloadAction<boolean>) => {
      state.autoScrollEnabled = action.payload;
    },

    // UI visibility
    setSettingsModalVisible: (state, action: PayloadAction<boolean>) => {
      state.isSettingsModalVisible = action.payload;
    },
    setInfoPanelVisible: (state, action: PayloadAction<boolean>) => {
      state.isInfoPanelVisible = action.payload;
    },

    // Loading and error states
    setUILoading: (state, action: PayloadAction<boolean>) => {
      state.isUILoading = action.payload;
    },
    setUIError: (state, action: PayloadAction<string | null>) => {
      state.uiError = action.payload;
    },

    // Reset all UI state
    resetChatUI: () => initialState,
  },
});

// Export actions
export const {
  setInputFocused,
  setKeyboardHeight,
  toggleMessageSelection,
  setSelectedMessages,
  clearMessageSelection,
  setEditingMessage,
  setAutoScrollEnabled,
  setSettingsModalVisible,
  setInfoPanelVisible,
  setUILoading,
  setUIError,
  resetChatUI,
} = chatUISlice.actions;

// Memoized selectors
export const selectChatUI = (state: { chatUI: ChatUIState }) => state.chatUI;

export const selectIsInputFocused = createSelector(
  selectChatUI,
  (chatUI) => chatUI.isInputFocused
);

export const selectKeyboardHeight = createSelector(
  selectChatUI,
  (chatUI) => chatUI.keyboardHeight
);

export const selectSelectedMessageIndices = createSelector(
  selectChatUI,
  (chatUI) => chatUI.selectedMessageIndices
);

export const selectHasSelectedMessages = createSelector(
  selectSelectedMessageIndices,
  (indices) => indices.length > 0
);

export const selectEditingMessageIndex = createSelector(
  selectChatUI,
  (chatUI) => chatUI.editingMessageIndex
);

export const selectIsEditingMessage = createSelector(
  selectEditingMessageIndex,
  (index) => index !== null
);

export const selectAutoScrollEnabled = createSelector(
  selectChatUI,
  (chatUI) => chatUI.autoScrollEnabled
);

export const selectIsSettingsModalVisible = createSelector(
  selectChatUI,
  (chatUI) => chatUI.isSettingsModalVisible
);

export const selectIsInfoPanelVisible = createSelector(
  selectChatUI,
  (chatUI) => chatUI.isInfoPanelVisible
);

export const selectIsUILoading = createSelector(
  selectChatUI,
  (chatUI) => chatUI.isUILoading
);

export const selectUIError = createSelector(
  selectChatUI,
  (chatUI) => chatUI.uiError
);

// Export reducer as default
export default chatUISlice.reducer;
