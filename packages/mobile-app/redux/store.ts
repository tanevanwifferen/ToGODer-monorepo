import { configureStore, combineReducers } from "@reduxjs/toolkit";
import { persistStore, persistReducer, PersistConfig } from "redux-persist";
import AsyncStorage from "@react-native-async-storage/async-storage";

import globalConfigReducer from "./slices/globalConfigSlice";
import chatsReducer, { ChatsState } from "./slices/chatsSlice";
import chatUIReducer, { ChatUIState } from "./slices/chatUISlice";
import authReducer, { AuthState } from "./slices/authSlice";
import experienceReducer from "./slices/experienceSlice";
import balanceReducer, { BalanceState } from "./slices/balanceSlice";
import passcodeReducer from "./slices/passcodeSlice";
import personalReducer, { PersonalState } from "./slices/personalSlice";
import systemPromptReducer, {
  SystemPromptState,
} from "./slices/systemPromptSlice";
import userSettingsReducer, {
  UserSettingsState,
} from "./slices/userSettingsSlice";
import projectsReducer, { ProjectsState } from "./slices/projectsSlice";
import artifactsReducer, { ArtifactsState } from "./slices/artifactsSlice";
import { personalDataMiddleware } from "./middleware/personalDataMiddleware";
import { syncMiddleware } from "./middleware/syncMiddleware";
import { GlobalConfig } from "../model/GlobalConfig";

export interface RootState {
  globalConfig: GlobalConfig;
  chats: ChatsState;
  chatUI: ChatUIState;
  auth: AuthState;
  experience: {
    modalVisible: boolean;
  };
  balance: BalanceState;
  passcode: {
    passcode: string | null;
    isLocked: boolean;
  };
  personal: PersonalState;
  systemPrompt: SystemPromptState;
  userSettings: UserSettingsState;
  projects: ProjectsState;
  artifacts: ArtifactsState;
}

const rootReducer = combineReducers({
  globalConfig: globalConfigReducer,
  chats: chatsReducer,
  chatUI: chatUIReducer,
  auth: authReducer,
  experience: experienceReducer,
  balance: balanceReducer,
  passcode: passcodeReducer,
  personal: personalReducer,
  systemPrompt: systemPromptReducer,
  userSettings: userSettingsReducer,
  projects: projectsReducer,
  artifacts: artifactsReducer,
});

// Migration function to transfer settings from chats slice to userSettings slice
const migrateSettings = (state: any) => {
  // Check if userSettings is empty or uninitialized and chats has settings
  if (state?.chats && (!state?.userSettings || !state.userSettings.model)) {
    const chatsState = state.chats;

    // Migrate settings from chats to userSettings
    const migratedSettings = {
      model: chatsState.model || "meta-llama/llama-3.2-90b-vision-instruct",
      communicationStyle: chatsState.communicationStyle ?? 2,
      language: chatsState.language || "",
      assistant_name: chatsState.assistant_name || "ToGODer",
      humanPrompt: chatsState.humanPrompt ?? true,
      keepGoing: chatsState.keepGoing ?? true,
      outsideBox: chatsState.outsideBox ?? true,
      holisticTherapist: chatsState.holisticTherapist ?? true,
      libraryIntegrationEnabled: chatsState.libraryIntegrationEnabled ?? false,
      customSystemPrompt: state.systemPrompt?.customSystemPrompt || null,
      isGeneratingPrompt: false,
      promptLastGenerated: state.systemPrompt?.lastGenerated || null,
      promptError: null,
    };

    return {
      ...state,
      userSettings: migratedSettings,
    };
  }

  return state;
};

const persistConfig: PersistConfig<RootState> = {
  key: "root",
  storage: AsyncStorage,
  whitelist: [
    "globalConfig",
    "chats",
    "chatUI",
    "auth",
    "balance",
    "passcode",
    "personal",
    "systemPrompt",
    "userSettings",
    "projects",
    "artifacts",
  ],
  migrate: (state: any) => {
    return Promise.resolve(migrateSettings(state));
  },
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ["persist/PERSIST", "persist/REHYDRATE"],
      },
    }).concat(personalDataMiddleware).concat(syncMiddleware),
});

export const persistor = persistStore(store);

export type AppDispatch = typeof store.dispatch;
