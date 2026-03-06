import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";
import { ChatRequestCommunicationStyle } from "../../model/ChatRequest";

/**
 * User Settings Slice
 *
 * Consolidated settings interface separating user preferences from chat data.
 * Organized into logical groups for better maintainability:
 * - Conversation: model, communication style, language, assistant name
 * - Behavior: prompt toggles and features
 * - Features: integrations and capabilities
 * - Prompt: custom system prompt configuration
 */

export interface UserSettingsState {
  // Conversation Settings
  model: string;
  communicationStyle: ChatRequestCommunicationStyle;
  language: string;
  assistant_name: string;

  // Behavior Settings
  humanPrompt: boolean;
  keepGoing: boolean;
  outsideBox: boolean;
  holisticTherapist: boolean;

  // Feature Settings
  libraryIntegrationEnabled: boolean;

  // Custom System Prompt
  customSystemPrompt: string | null;
  isGeneratingPrompt: boolean;
  promptLastGenerated: string | null; // ISO timestamp
  promptError: string | null;

  // Sync tracking
  updatedAt: number;
}

const initialState: UserSettingsState = {
  // Conversation defaults
  model: "meta-llama/llama-3.2-90b-vision-instruct",
  communicationStyle: ChatRequestCommunicationStyle.AdaptToConversant,
  language: "",
  assistant_name: "ToGODer",

  // Behavior defaults
  humanPrompt: true,
  keepGoing: true,
  outsideBox: true,
  holisticTherapist: true,

  // Feature defaults
  libraryIntegrationEnabled: false,

  // Prompt defaults
  customSystemPrompt: null,
  isGeneratingPrompt: false,
  promptLastGenerated: null,
  promptError: null,

  // Sync defaults
  updatedAt: Date.now(),
};

const userSettingsSlice = createSlice({
  name: "userSettings",
  initialState,
  reducers: {
    // Conversation Settings
    setModel: (state, action: PayloadAction<string>) => {
      state.model = action.payload;
      state.updatedAt = Date.now();
    },
    setCommunicationStyle: (
      state,
      action: PayloadAction<ChatRequestCommunicationStyle>
    ) => {
      state.communicationStyle = action.payload;
      state.updatedAt = Date.now();
    },
    setLanguage: (state, action: PayloadAction<string>) => {
      state.language = action.payload;
      state.updatedAt = Date.now();
    },
    setAssistantName: (state, action: PayloadAction<string>) => {
      state.assistant_name = action.payload;
      state.updatedAt = Date.now();
    },

    // Behavior Settings
    setHumanPrompt: (state, action: PayloadAction<boolean>) => {
      state.humanPrompt = action.payload;
      state.updatedAt = Date.now();
    },
    setKeepGoing: (state, action: PayloadAction<boolean>) => {
      state.keepGoing = action.payload;
      state.updatedAt = Date.now();
    },
    setOutsideBox: (state, action: PayloadAction<boolean>) => {
      state.outsideBox = action.payload;
      state.updatedAt = Date.now();
    },
    setHolisticTherapist: (state, action: PayloadAction<boolean>) => {
      state.holisticTherapist = action.payload;
      state.updatedAt = Date.now();
    },

    // Feature Settings
    setLibraryIntegrationEnabled: (state, action: PayloadAction<boolean>) => {
      state.libraryIntegrationEnabled = action.payload;
      state.updatedAt = Date.now();
    },

    // Bulk update settings (for migration and compatibility)
    updateSettings: (state, action: PayloadAction<Partial<UserSettingsState>>) => {
      return {
        ...state,
        ...action.payload,
        updatedAt: Date.now(),
      };
    },

    // Custom System Prompt
    setCustomSystemPrompt: (state, action: PayloadAction<string>) => {
      state.customSystemPrompt = action.payload;
      state.promptLastGenerated = new Date().toISOString();
      state.promptError = null;
      state.updatedAt = Date.now();
    },
    setGeneratingPrompt: (state, action: PayloadAction<boolean>) => {
      state.isGeneratingPrompt = action.payload;
      if (action.payload) {
        state.promptError = null;
      }
    },
    setPromptError: (state, action: PayloadAction<string>) => {
      state.promptError = action.payload;
      state.isGeneratingPrompt = false;
    },
    clearCustomSystemPrompt: (state) => {
      state.customSystemPrompt = null;
      state.promptLastGenerated = null;
      state.promptError = null;
      state.updatedAt = Date.now();
    },

    // Sync actions
    setUserSettingsFromSync: (
      state,
      action: PayloadAction<Partial<UserSettingsState> & { updatedAt: number }>
    ) => {
      return {
        ...state,
        ...action.payload,
      };
    },
  },
});

export const {
  setModel,
  setCommunicationStyle,
  setLanguage,
  setAssistantName,
  setHumanPrompt,
  setKeepGoing,
  setOutsideBox,
  setHolisticTherapist,
  setLibraryIntegrationEnabled,
  updateSettings,
  setCustomSystemPrompt,
  setGeneratingPrompt,
  setPromptError,
  clearCustomSystemPrompt,
  setUserSettingsFromSync,
} = userSettingsSlice.actions;

// ===== SELECTORS =====

// Conversation Settings Selectors
export const selectModel = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.model
);

export const selectCommunicationStyle = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.communicationStyle
);

export const selectLanguage = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.language
);

export const selectAssistantName = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.assistant_name
);

// Behavior Settings Selectors
export const selectHumanPrompt = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.humanPrompt
);

export const selectKeepGoing = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.keepGoing
);

export const selectOutsideBox = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.outsideBox
);

export const selectHolisticTherapist = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.holisticTherapist
);

// Feature Settings Selectors
export const selectLibraryIntegrationEnabled = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.libraryIntegrationEnabled
);

// Custom System Prompt Selectors
export const selectCustomSystemPrompt = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.customSystemPrompt
);

export const selectIsGeneratingPrompt = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.isGeneratingPrompt
);

export const selectPromptError = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.promptError
);

export const selectPromptLastGenerated = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => settings.promptLastGenerated
);

// Composite Selectors for grouped access
export const selectConversationSettings = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => ({
    model: settings.model,
    communicationStyle: settings.communicationStyle,
    language: settings.language,
    assistant_name: settings.assistant_name,
  })
);

export const selectBehaviorSettings = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => ({
    humanPrompt: settings.humanPrompt,
    keepGoing: settings.keepGoing,
    outsideBox: settings.outsideBox,
    holisticTherapist: settings.holisticTherapist,
  })
);

export const selectFeatureSettings = createSelector(
  (state: { userSettings: UserSettingsState }) => state.userSettings,
  (settings) => ({
    libraryIntegrationEnabled: settings.libraryIntegrationEnabled,
  })
);

// Complete settings selector for ChatRequest compatibility
export const selectChatSettings = createSelector(
  (state: { userSettings: UserSettingsState; personal: any }) => ({
    userSettings: state.userSettings,
    personal: state.personal,
  }),
  ({ userSettings, personal }) => ({
    model: userSettings.model,
    humanPrompt: userSettings.humanPrompt,
    keepGoing: userSettings.keepGoing,
    outsideBox: userSettings.outsideBox,
    holisticTherapist: userSettings.holisticTherapist,
    communicationStyle: userSettings.communicationStyle,
    assistant_name: userSettings.assistant_name,
    language: userSettings.language,
    libraryIntegrationEnabled: userSettings.libraryIntegrationEnabled,
    customSystemPrompt: userSettings.customSystemPrompt || undefined,
    persona: personal?.persona || undefined,
  })
);

export default userSettingsSlice.reducer;
