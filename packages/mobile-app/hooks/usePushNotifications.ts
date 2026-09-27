import { useState, useEffect, useCallback, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { ChatApiClient } from '../apiClients/ChatApiClient';
import { store } from '../redux/store';
import { selectToken } from '../redux/slices/authSlice';

/**
 * Show notifications while the app is foregrounded. Without this handler,
 * expo-notifications silently drops notifications received in the foreground.
 * Only configured on native platforms (web uses a different delivery path).
 */
if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/**
 * Resolve the EAS project id needed by getExpoPushTokenAsync. Try, in order:
 * 1. EXPO_PROJECT_ID env var (set by EAS builds automatically in newer SDKs)
 * 2. extra.eas.projectId from app config
 * 3. Constants.easConfig.projectId (native builds baked with eas-cli)
 */
function resolveProjectId(): string | undefined {
  const extra = (Constants.expoConfig?.extra as Record<string, any> | undefined) ?? {};
  return (
    process.env.EXPO_PROJECT_ID ||
    extra?.eas?.projectId ||
    (Constants as any).easConfig?.projectId ||
    undefined
  );
}

/**
 * Hook to register the device for push notifications and sync the
 * Expo Push Token to the ToGODer backend.
 *
 * Usage: Call this once at app startup (e.g. in _layout.tsx).
 * The hook handles permissions, token retrieval, and backend sync.
 * Token sync waits for an authenticated user (the backend requires auth),
 * and retries automatically once the user logs in.
 */
export function usePushNotificationSetup() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);
  const pushTokenRef = useRef<string | null>(null);

  useEffect(() => {
    registerPushNotifications().catch((err) => {
      console.error('[push] Registration failed:', err);
    });
  }, []);

  // Re-sync the token to the backend once the user authenticates (or the
  // token changes). Covers the startup race where the permission prompt fires
  // before the persisted credentials have produced a fresh auth token.
  useEffect(() => {
    let previousToken = selectToken(store.getState());
    const unsubscribe = store.subscribe(() => {
      const currentToken = selectToken(store.getState());
      if (currentToken && currentToken !== previousToken) {
        const deviceToken = pushTokenRef.current;
        if (deviceToken) {
          ChatApiClient.registerPushToken(deviceToken, Platform.OS).catch(
            (err) => console.error('[push] Failed to sync token on login:', err),
          );
        }
      }
      previousToken = currentToken;
    });
    return unsubscribe;
  }, []);

  const registerPushNotifications = async () => {
    if (Platform.OS === 'web') {
      // Web doesn't support Expo push notifications natively
      return;
    }

    // Android needs a notification channel before notifications can show.
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FFFFFF',
        });
      } catch (err) {
        console.error('[push] Failed to create Android channel:', err);
      }
    }

    // Request permission (this triggers the OS notification permission prompt)
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.log('[push] Permission not granted');
      return;
    }

    setPermissionGranted(true);

    try {
      const projectId = resolveProjectId();
      const tokenData = projectId
        ? await Notifications.getExpoPushTokenAsync({ projectId })
        : await Notifications.getExpoPushTokenAsync();

      const token = tokenData.data;
      console.log('[push] Got Expo push token:', token);
      setPushToken(token);
      pushTokenRef.current = token;

      // Sync to backend (no-op if the user isn't authenticated yet; the
      // auth-subscription above retries it once they log in)
      await syncTokenToBackend(token);
    } catch (err) {
      console.error('[push] Failed to register push token:', err);
    }
  };

  const syncTokenToBackend = async (token: string) => {
    const authToken = selectToken(store.getState());
    if (!authToken) {
      console.log('[push] Not authenticated yet; token will sync after login');
      return;
    }
    await ChatApiClient.registerPushToken(token, Platform.OS);
    console.log('[push] Token synced to backend');
  };

  const unregisterPushToken = useCallback(async () => {
    if (!pushToken) return;
    try {
      await ChatApiClient.unregisterPushToken(pushToken);
      setPushToken(null);
      pushTokenRef.current = null;
    } catch (err) {
      console.error('[push] Failed to unregister push token:', err);
    }
  }, [pushToken]);

  return { pushToken, permissionGranted, unregisterPushToken };
}