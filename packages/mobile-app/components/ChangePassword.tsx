import React, { useState } from "react";
import {
  TextInput,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  ActivityIndicator,
} from "react-native";
import { AuthApiClient } from "../apiClients/AuthApiClient";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";
import { Colors } from "../constants/Colors";

interface ChangePasswordProps {
  onBack: () => void;
}

export const ChangePassword: React.FC<ChangePasswordProps> = ({ onBack }) => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const buttonTextColor = colorScheme === "dark" ? "#151718" : "#fff";

  const handleChangePassword = async () => {
    try {
      setError("");
      setMessage("");

      if (!currentPassword || !newPassword || !confirmPassword) {
        setError("All fields are required");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("New passwords do not match");
        return;
      }
      if (newPassword.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }

      setLoading(true);
      await AuthApiClient.changePassword(currentPassword, newPassword);
      setMessage("Password changed successfully");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setError(err.toString());
    } finally {
      setLoading(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      {error ? (
        <ThemedText
          style={[
            styles.error,
            { color: colorScheme === "dark" ? "#ff6b6b" : "red" },
          ]}
        >
          {error}
        </ThemedText>
      ) : null}
      {message ? (
        <ThemedText
          style={[
            styles.message,
            { color: colorScheme === "dark" ? "#69db7c" : "green" },
          ]}
        >
          {message}
        </ThemedText>
      ) : null}

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.background,
            borderColor: colorScheme === "dark" ? colors.icon : "#ddd",
            color: colors.text,
          },
        ]}
        placeholder="Current Password"
        placeholderTextColor={colors.icon}
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
      />

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.background,
            borderColor: colorScheme === "dark" ? colors.icon : "#ddd",
            color: colors.text,
          },
        ]}
        placeholder="New Password"
        placeholderTextColor={colors.icon}
        value={newPassword}
        onChangeText={setNewPassword}
        secureTextEntry
      />

      <TextInput
        style={[
          styles.input,
          {
            backgroundColor: colors.background,
            borderColor: colorScheme === "dark" ? colors.icon : "#ddd",
            color: colors.text,
          },
        ]}
        placeholder="Confirm New Password"
        placeholderTextColor={colors.icon}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.tint }]}
        onPress={handleChangePassword}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color={buttonTextColor} />
        ) : (
          <ThemedText style={[styles.buttonText, { color: buttonTextColor }]}>
            Change Password
          </ThemedText>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkButton} onPress={onBack}>
        <ThemedText style={[styles.linkText, { color: colors.tint }]}>
          Back
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: "center",
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 15,
    paddingHorizontal: 15,
  },
  button: {
    height: 50,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "600",
  },
  error: {
    marginBottom: 15,
    textAlign: "center",
  },
  message: {
    marginBottom: 15,
    textAlign: "center",
  },
  linkButton: {
    marginTop: 15,
    alignItems: "center",
  },
  linkText: {
    fontSize: 14,
  },
});
