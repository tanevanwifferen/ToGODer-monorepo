/**
 * Service responsible for initializing the app
 * Handles setup of authentication, API services, and initial app state
 * Note: This service is being phased out in favor of the useInitialization hook
 * for components that have access to React context.
 */
import { store } from '../redux/store';
import { ApiClient } from '../apiClients/ApiClient';
import { AuthService } from './AuthService';
import { BalanceService } from './BalanceService';
import { SyncService } from './SyncService';
import { setGlobalConfig } from '../redux/slices/globalConfigSlice';
import { addChat, setCurrentChat } from '../redux/slices/chatsSlice';
import * as Calendar from 'expo-calendar';
import { AuthApiClient } from '../apiClients/AuthApiClient';
import { setAuthData } from '../redux/slices/authSlice';
import { RouteService } from './RouteService';
import { v4 as uuidv4 } from 'uuid';

// Import the ExperienceService to handle language input modal
import { ExperienceService } from './ExperienceService';

export class InitializationService {
  private static readonly selectToken = (state: any) => state.auth.token;
  private static readonly selectIsAuthenticated = (state: any) => Boolean(state.auth.token);
  private static readonly selectAppFirstLaunch = (state: any) => state.globalConfig.appFirstLaunch;
  private static readonly selectCredentials = (state: any) => ({
    email: state.auth.email,
    password: state.auth.password
  });

  static async initialize() {
    // Initialize API client with auth store
    ApiClient.initialize();
    await Calendar.requestCalendarPermissionsAsync();

    // Wait for state to be rehydrated
    await new Promise<void>((resolve) => {
      const unsubscribe = store.subscribe(() => {
        const state = store.getState();
        if (state._persist?.rehydrated) {
          unsubscribe();
          resolve();
        }
      });
    });

    // Check if this is first app launch
    const state = store.getState();
    const isFirstLaunch = InitializationService.selectAppFirstLaunch(state);
    
    const currentRoute = RouteService.getCurrentRoute();
    const isChatRoute = currentRoute === '/' || currentRoute === '/index' || currentRoute === '/chat';
    
    if(isFirstLaunch && isChatRoute){
      // Use the ExperienceService to show language input modal
      // This will handle all the necessary checks internally
      ExperienceService.showLanguageInputIfNeeded();
      
      // Create initial chat
      const newChatId = uuidv4();
      store.dispatch(addChat({
        id: newChatId,
        messages: [],
        memories: [],
      }));
      store.dispatch(setCurrentChat(newChatId));
      
      // Mark app as no longer first launch and user as onboarded
      store.dispatch(setGlobalConfig({
        appFirstLaunch: false,
        userOnboarded: true
      }));
    }

    // Start token refresh service if user is authenticated
    let isAuthenticated = InitializationService.selectIsAuthenticated(state);
    const { email, password } = InitializationService.selectCredentials(state);
    
    // If we have credentials, always get a fresh token on app start
    if (email && password) {
      try {
        console.log("Fetching fresh token with stored credentials");
        const response = await AuthApiClient.login(email, password);
        store.dispatch(setAuthData({ ...response }));
        
        // Store credentials in AuthService for potential re-authentication
        AuthService.storeCredentials(email, password);
        
        isAuthenticated = true;
      } catch (error) {
        console.error("Failed to authenticate with stored credentials:", error);
      }
    }
    
    if (isAuthenticated) {
      // Start auth services with the fresh token
      AuthService.startAuthServices();
      AuthService.startAppFocusHandler();
      // Fetch initial balance if authenticated
      BalanceService.getInstance().fetchBalance();

      // Initialize sync service if we have credentials
      const currentState = store.getState();
      const userId = currentState.auth.userId;
      const password = currentState.auth.password;
      if (userId && password) {
        try {
          await SyncService.getInstance().initialize(userId, password);
          await SyncService.getInstance().pullAndMerge();
        } catch (error) {
          console.error('Failed to initialize sync service:', error);
        }
      }
    }

    // Subscribe to auth state changes
    store.subscribe(() => {
      const currentState = store.getState();
      const currentIsAuthenticated = InitializationService.selectIsAuthenticated(currentState);
      
      if (currentIsAuthenticated && !AuthService.RefreshInterval) {
        AuthService.startTokenRefreshService();
        // Fetch balance when user becomes authenticated
      } else {
        AuthService.stopTokenRefreshService();
      }
    });
  }
}
