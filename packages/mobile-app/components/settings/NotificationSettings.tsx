import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Alert,
  Linking,
} from "react-native";
import * as Notifications from "expo-notifications";
import { Colors } from "../../constants/Colors";
import { useFocusEffect } from "expo-router";

/**
 * Lets the user inspect and manage push notification permission, and send a
 * test notification to confirm delivery. Without notification permission an
 * Expo push token is never registered, so scheduled check-ins never arrive.
 */
export default function NotificationSettings() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const isDark = colorScheme === "dark";

  const [status, setStatus] = useState<string>("unknown");
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      refreshStatus();
    }, []),
  );

  const refreshStatus = async () => {
    try {
      const { status: s } = await Notifications.getPermissionsAsync();
      setStatus(s);
    } catch (err) {
      console.error("[push] Failed to read permission status:", err);
      setStatus("error");
    }
  };

  const handleEnable = async () => {
    setBusy(true);
    try {
      const { status: s } = await Notifications.requestPermissionsAsync();
      setStatus(s);
      if (s !== "granted") {
        Alert.alert(
          "Notifications not granted",
          "Please enable notifications for ToGODer in your device settings.",
          [
            { text: "Open Settings", onPress: () => Linking.openSettings() },
            { text: "OK" },
          ],
        );
      }
    } catch (err) {
      console.error("[push] Failed to request permission:", err);
    } finally {
      setBusy(false);
    }
  };

  const handleTest = async () => {
    setBusy(true);
    try {
      const { status: s } = await Notifications.getPermissionsAsync();
      if (s !== "granted") {
        await handleEnable();
        return;
      }
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "ToGODer test 🏮",
          body: "Push notifications are working!",
          sound: "default",
        },
        trigger: null, // fire immediately
      });
      Alert.alert("Test sent", "A test notification should appear shortly.");
    } catch (err) {
      console.error("[push] Failed to send test notification:", err);
      Alert.alert("Test failed", "Could not send a test notification.");
    } finally {
      setBusy(false);
    }
  };

  const cardBg = isDark ? "#2c2c2e" : "#ffffff";
  const textColor = isDark ? "#ffffff" : "#000000";
  const mutedColor = isDark ? "#8e8e93" : "#6b7280";
  const borderColor = isDark ? "#38383a" : "#e5e5e5";

  const granted = status === "granted";
  const statusLabel =
    status === "granted"
      ? "Granted ✓"
      : status === "denied"
        ? "Denied — check-ins cannot reach you"
        : status === "undetermined"
          ? "Not yet asked"
          : "Unknown";

  return (
    <View style={[styles.container, { backgroundColor: cardBg }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: textColor }]}>
            Notifications
          </Text>
          <Text style={[styles.subtitle, { color: mutedColor }]}>
            {statusLabel}
            {"\n"}
            Scheduled check-ins and wake-ups are delivered as push
            notifications. Enable it so ToGODer can actually reach you.
          </Text>
        </View>
      </View>

      <View style={[styles.buttons, { borderTopColor: borderColor }]}>
        {!granted && (
          <TouchableOpacity
            onPress={handleEnable}
            disabled={busy}
            style={styles.button}
          >
            <Text style={[styles.buttonText, { color: colors.tint }]}>
              Enable notifications
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleTest}
          disabled={busy}
          style={styles.button}
        >
          <Text style={[styles.buttonText, { color: colors.tint }]}>
            Send test notification
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 12,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    lineHeight: 18,
  },
  buttons: {
    flexDirection: "row",
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 12,
    gap: 12,
  },
  button: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: "500",
  },
});