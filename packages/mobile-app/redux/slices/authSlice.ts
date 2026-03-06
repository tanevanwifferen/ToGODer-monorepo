/**
 * Redux slice for managing authentication state
 * Handles storage and updates of auth-related data like tokens and user info
 */

import { createSelector, createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
  password: string | null;
  lastTokenRefresh: number | null;
}

const initialState: AuthState = {
  token: null,
  userId: null,
  email: null,
  password: null,
  lastTokenRefresh: null,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setAuthData: (state, action: PayloadAction<Partial<AuthState>>) => ({
      ...state,
      ...action.payload,
      lastTokenRefresh: Date.now(),
    }),
    clearAuth: (state) => {
      state.token = null;
      state.email = null;
      state.password = null;
      state.userId = null;
      state.lastTokenRefresh = null;
    },
    updateTokenRefreshTime: (state) => {
      state.lastTokenRefresh = Date.now();
    },
  },
});

export const { setAuthData, clearAuth, updateTokenRefreshTime } = authSlice.actions;

// Memoized selectors for efficiently accessing auth state
export const selectEmail = createSelector(
  (state: { auth: AuthState }) => state.auth,
  (auth) => auth.email
);

export const selectPassword = createSelector(
  (state: { auth: AuthState }) => state.auth,
  (auth) => auth.password
);

export const selectLastTokenRefresh = createSelector(
  (state: { auth: AuthState }) => state.auth,
  (auth) => auth.lastTokenRefresh
);

export const selectIsAuthenticated = createSelector(
  (state: { auth: AuthState }) => state.auth,
  (auth) => !!auth.token
);

export const selectToken = createSelector(
  (state: { auth: AuthState }) => state.auth,
  (auth) => auth.token
);

export const selectUserId = createSelector(
  (state: { auth: AuthState }) => state.auth,
  (auth) => auth.userId
);

export default authSlice.reducer;
