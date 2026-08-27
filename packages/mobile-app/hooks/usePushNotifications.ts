import { useState, useEffect, useCallback } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { ChatApiClient } from '../apiClients/ChatApiClient';

/**
 * Hook to register the device for push notifications and sync the
 * Expo Push Token to the ToGODer backend.
 *
 * Usage: Call this once at app startup (e.g. in _layout.tsx).
 * The hook handles permissions, token retrieval, and backend sync.
 */
export function usePushNotificationSetup() {
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [permissionGranted, setPermissionGranted] = useState(false);

  useEffect(() => {
    registerPushNotifications();
  }, []);

  const registerPushNotifications = async () => {
    if (Platform.OS === 'web') {
      // Web doesn't support Expo push notifications natively
      return;
    }

    // Request permission
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
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: process.env.EXPO_PROJECT_ID,
      });

      const token = tokenData.data;
      console.log('[push] Got Expo push token:', token);
      setPushToken(token);

      // Sync to backend
      await ChatApiClient.registerPushToken(token, Platform.OS);
      console.log('[push] Token synced to backend');
    } catch (err) {
      console.error('[push] Failed to register push token:', err);
    }
  };

  const unregisterPushToken = useCallback(async () => {
    if (!pushToken) return;
    try {
      await ChatApiClient.unregisterPushToken(pushToken);
      setPushToken(null);
    } catch (err) {
      console.error('[push] Failed to unregister push token:', err);
    }
  }, [pushToken]);

  return { pushToken, permissionGranted, unregisterPushToken };
}