import { useCallback, useEffect } from "react";
import { GlobalApiClient } from "../apiClients/GlobalApiClient";
import {
  selectOldDefaultModel,
  setGlobalConfig,
} from "../redux/slices/globalConfigSlice";
import { updateSettings } from "../redux/slices/userSettingsSlice";
import { store } from "../redux/store";
import { InitializationService } from "../services/InitializationService";

export function useInitialize() {
  const initializeApp = useCallback(async () => {
    try {
      // Initialize auth and API services
      InitializationService.initialize();

      // Fetch global config
      const globalConfig = await GlobalApiClient.getGlobalConfig();
      store.dispatch(setGlobalConfig(globalConfig));
      const oldDefaultModel = selectOldDefaultModel(store.getState());
      const currentModel = store.getState().userSettings.model;
      const isAuthenticated = Boolean(store.getState().auth.token);

      // Only migrate authenticated users from the old (guest) default to
      // DeepSeek V4 Pro. Non-authenticated users keep the guest default
      // (Ministral, the first model returned by the server).
      if (
        isAuthenticated &&
        oldDefaultModel &&
        (!currentModel || currentModel === oldDefaultModel)
      ) {
        store.dispatch(
          updateSettings({
            model: "deepseek/deepseek-v4-pro",
          })
        );
      }
      // Only dispatch when the value actually changed: updateSettings bumps
      // the settings-wide updatedAt, and an unconditional dispatch here made
      // every app launch win the sync merge and drag the whole settings
      // object (including the selected model) along with it.
      if (
        typeof globalConfig.libraryIntegrationEnabled === "boolean" &&
        globalConfig.libraryIntegrationEnabled !==
          store.getState().userSettings.libraryIntegrationEnabled
      ) {
        store.dispatch(
          updateSettings({
            libraryIntegrationEnabled: globalConfig.libraryIntegrationEnabled,
          })
        );
      }

      const prompts = await GlobalApiClient.getPrompts();
      store.dispatch(setGlobalConfig({ prompts }));
    } catch (error) {
      console.error("Failed to initialize app:", error);
    }
  }, []);

  useEffect(() => {
    initializeApp();
  }, [initializeApp]);
}
