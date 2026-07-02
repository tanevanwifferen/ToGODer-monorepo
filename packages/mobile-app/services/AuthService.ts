/**
 * Service class for managing authentication lifecycle
 * Handles token refresh and re-authentication when needed
 */

import {
  clearAuth,
  selectIsAuthenticated,
  setAuthData,
} from "../redux/slices/authSlice";
import { AuthApiClient } from "../apiClients/AuthApiClient";
import { store } from "../redux/store";
import { AppState } from "react-native";

/**
 * Service class for managing authentication lifecycle
 * Handles token refresh and re-authentication when needed
 * Stores credentials securely for automatic re-authentication
 */
export class AuthService {
  private static refreshInterval: NodeJS.Timeout | number | null = null;
  public static get RefreshInterval() {
    return AuthService.refreshInterval;
  }
  // Refresh token every 15 minutes
  private static readonly REFRESH_INTERVAL = 15 * 60 * 1000;
  private static readonly TOKEN_EXPIRY_BUFFER = 60 * 1000; // 1 minute buffer

  private static storedEmail: string | null = null;
  private static storedPassword: string | null = null;
  private static appStateSubscription: any = null;

  /**
   * Starts the authentication service
   * Sets up token refresh and app state monitoring
   */
  static startAuthServices() {
    this.startTokenRefreshService();
    this.startAppFocusHandler();
  }

  /**
   * Stops all authentication services
   */
  static stopAuthServices() {
    this.stopTokenRefreshService();
    this.stopAppFocusHandler();
  }

  /**
   * Starts the automatic token refresh service
   */
  static startTokenRefreshService() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    this.refreshInterval = setInterval(() => {
      this.checkAndRefreshToken();
    }, this.REFRESH_INTERVAL);

    // Do an immediate check
    this.checkAndRefreshToken();
  }

  /**
   * Stops the token refresh service
   */
  static stopTokenRefreshService() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    // Credentials are cleared explicitly on logout (useAuth), not here:
    // this method also runs on transient auth-state churn and wiping the
    // credentials would make the next token refresh log the user out.
  }

  /**
   * Checks if token needs refresh and performs refresh if necessary
   * If refresh fails, attempts re-authentication with stored credentials
   */
  static async checkAndRefreshToken() {
    const state = store.getState();
    const isAuthenticated = selectIsAuthenticated(state);
    const userId = state.auth.userId;
    const lastTokenRefresh = state.auth.lastTokenRefresh;

    if (!isAuthenticated || !userId) {
      return;
    }

    const shouldRefresh =
      lastTokenRefresh &&
      Date.now() - lastTokenRefresh >
        this.REFRESH_INTERVAL - this.TOKEN_EXPIRY_BUFFER;

    if (shouldRefresh) {
      try {
        const response = await AuthApiClient.refreshToken(userId);
        store.dispatch(setAuthData(response));
      } catch (error: any) {
        const status = error?.status ?? error?.response?.status;
        if (status === 401 || status === 403) {
          // Token rejected by the server: fall back to a full re-login
          await this.tryReAuthenticate(state.auth.email, state.auth.password);
        }
        // Any other failure (network, 429, 5xx) is transient — keep the
        // session and let the next interval retry.
      }
    }
  }

  /**
   * Attempts to re-authenticate using stored credentials
   * Clears auth state if re-authentication fails
   */
  public static async tryReAuthenticate(
    email: string | null = null,
    password: string | null = null
  ) {
    // Use provided credentials or fall back to stored ones
    const useEmail = email || this.storedEmail;
    const usePassword = password || this.storedPassword;

    if (useEmail && usePassword) {
      try {
        const response = await AuthApiClient.login(useEmail, usePassword);
        store.dispatch(setAuthData(response));
      } catch (error: any) {
        const status = error?.status ?? error?.response?.status;
        if (status === 401 || status === 403) {
          // The server explicitly rejected the credentials
          store.dispatch(clearAuth());
          console.error("Re-authentication rejected, logging out:", error);
        } else {
          // Transient failure (offline, rate limit, server error): keep
          // the existing session and retry on the next refresh cycle.
          console.error("Re-authentication failed transiently:", error);
        }
      }
    } else if (!store.getState().auth.token) {
      store.dispatch(clearAuth());
    }
  }

  /**
   * Checks if the current token is still valid
   */
  static isTokenValid(): boolean {
    const state = store.getState();
    const isAuthenticated = selectIsAuthenticated(state);
    const lastTokenRefresh = state.auth.lastTokenRefresh;

    if (!isAuthenticated || !lastTokenRefresh) {
      return false;
    }

    const tokenAge = Date.now() - lastTokenRefresh;
    return tokenAge < this.REFRESH_INTERVAL;
  }

  /**
   * Sets up app focus monitoring
   */
  static startAppFocusHandler() {
    // Remove any existing listener first so repeated calls don't stack
    // duplicate handlers (each one used to fire its own login request).
    this.stopAppFocusHandler();
    this.appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active") {
          // Refresh the token only if it's stale; a full re-login on every
          // foreground caused spurious logouts on transient failures.
          this.checkAndRefreshToken();
        }
      }
    );
  }

  /**
   * Cleans up app focus monitoring
   */
  static stopAppFocusHandler() {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
  }

  /**
   * Stores user credentials for re-authentication
   * These are kept in memory for security reasons
   */
  public static storeCredentials(email: string, password: string) {
    this.storedEmail = email;
    this.storedPassword = password;
  }

  /**
   * Clears stored credentials
   */
  static clearStoredCredentials() {
    this.storedEmail = null;
    this.storedPassword = null;
  }
}
