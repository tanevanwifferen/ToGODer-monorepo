import { useCallback, useEffect } from "react";
import { GlobalApiClient } from "../apiClients/GlobalApiClient";
import {
  selectDefaultModel,
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
      const defaultModel = selectDefaultModel(store.getState());
      const currentModel = store.getState().userSettings.model;
      // Only update the model if the server default changed AND the user
      // hasn't explicitly chosen a different model (i.e. they're still on
      // the old default).
      if (
        defaultModel !== oldDefaultModel &&
        defaultModel !== "" &&
        (!currentModel || currentModel === oldDefaultModel)
      ) {
        store.dispatch(
          updateSettings({
            model: defaultModel,
          })
        );
      }
      if (typeof globalConfig.libraryIntegrationEnabled === "boolean") {
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
