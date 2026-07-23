import React, { useEffect, useState } from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Alert,
  useColorScheme,
  Platform,
  View,
} from "react-native";
import { ThemedText } from "../ThemedText";
import { usePasscode } from "../../hooks/usePasscode";
import { GlobalApiClient } from "../../apiClients/GlobalApiClient";

interface LoggedInViewProps {
  email: string;
  onLogout: () => void;
  onChangePassword: () => void;
}

export const LoggedInView: React.FC<LoggedInViewProps> = ({
  email,
  onLogout,
  onChangePassword,
}) => {
  const { resetPasscode } = usePasscode();
  const colorScheme = useColorScheme();

  const handleResetPasscode = () => {
    Alert.alert(
      "Reset Passcode",
      "Are you sure you want to reset your passcode?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Reset",
          onPress: resetPasscode,
        },
      ]
    );
  };

  const [referralLink, setReferralLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    GlobalApiClient.getReferralCode()
      .then((data) => setReferralLink(data.referralLink))
      .catch(() => {});
  }, []);

  const handleCopyReferral = () => {
    if (!referralLink) return;
    if (Platform.OS === 'web') {
      navigator.clipboard.writeText(referralLink);
    } else {
      const Clipboard = require('expo-clipboard');
      Clipboard.setStringAsync(referralLink);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      <ThemedText style={styles.email}>{email}</ThemedText>

      {referralLink ? (
        <View style={styles.referralContainer}>
          <ThemedText style={styles.referralLabel}>Your Referral Link:</ThemedText>
          <ThemedText style={styles.referralLink} numberOfLines={1} selectable>
            {referralLink}
          </ThemedText>
          <TouchableOpacity
            style={[styles.copyBtn]}
            onPress={handleCopyReferral}
          >
            <ThemedText style={styles.copyBtnText}>
              {copied ? '✓ Copied!' : 'Copy'}
            </ThemedText>
          </TouchableOpacity>
        </View>
      ) : null}
      <TouchableOpacity
        style={[styles.button, { backgroundColor: colorScheme === "dark" ? "#4A4D50" : "#6c757d" }]}
        onPress={onLogout}
      >
        <ThemedText style={styles.buttonText}>Logout</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: colorScheme === "dark" ? "#4A4D50" : "#6c757d" },
        ]}
        onPress={onChangePassword}
      >
        <ThemedText style={styles.buttonText}>Change Password</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[
          styles.button,
          { backgroundColor: colorScheme === "dark" ? "#4A4D50" : "#6c757d" },
        ]}
        onPress={handleResetPasscode}
      >
        <ThemedText style={styles.buttonText}>Reset Passcode</ThemedText>
      </TouchableOpacity>
    </>
  );
};

const styles = StyleSheet.create({
  email: {
    fontSize: 16,
    textAlign: "center",
    marginBottom: 20,
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 10,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  referralContainer: {
    alignItems: "center",
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  referralLabel: {
    fontSize: 13,
    marginBottom: 6,
  },
  referralLink: {
    fontSize: 12,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    marginBottom: 8,
    opacity: 0.8,
  },
  copyBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#2563eb",
  },
  copyBtnText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
});
