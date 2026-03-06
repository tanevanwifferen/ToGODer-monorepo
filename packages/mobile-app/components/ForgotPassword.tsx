import React, { useState } from "react";
import {
  TextInput,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { AuthApiClient } from "../apiClients/AuthApiClient";
import { ThemedText } from "./ThemedText";
import { ThemedView } from "./ThemedView";
import { Colors } from "../constants/Colors";

export const ForgotPassword = ({
  setView,
}: {
  setView: (
    view: "login" | "loggedIn" | "createAccount" | "forgotPassword"
  ) => void;
}) => {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [step, setStep] = useState<"email" | "reset">("email");
  const [message, setMessage] = useState("");

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? "light"];
  const buttonTextColor = colorScheme === "dark" ? "#151718" : "#fff";

  const handleSendCode = async () => {
    try {
      setError("");
      if (!email) {
        setError("Email is required");
        return;
      }
      await AuthApiClient.sendForgotPasswordEmail(email);
      setMessage("Reset code has been sent to your email");
      setStep("reset");
    } catch (err: any) {
      setError(err.toString());
    }
  };

  const handleResetPassword = async () => {
    try {
      setError("");
      if (!code || !newPassword || !confirmPassword) {
        setError("All fields are required");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
      if (newPassword.length < 6) {
        setError("Password must be at least 6 characters");
        return;
      }

      await AuthApiClient.setNewPassword(code, email, newPassword);
      setMessage("Password reset successful");
      setTimeout(() => setView("login"), 2000);
    } catch (err: any) {
      setError(err.toString());
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

      {step === "email" && (
        <>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colorScheme === "dark" ? colors.icon : "#ddd",
                color: colors.text,
              },
            ]}
            placeholder="Email"
            placeholderTextColor={colors.icon}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />

          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.tint }]}
            onPress={handleSendCode}
          >
            <ThemedText style={[styles.buttonText, { color: buttonTextColor }]}>
              Send Reset Code
            </ThemedText>
          </TouchableOpacity>
        </>
      )}

      {step === "reset" && (
        <>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.background,
                borderColor: colorScheme === "dark" ? colors.icon : "#ddd",
                color: colors.text,
              },
            ]}
            placeholder="Reset Code"
            placeholderTextColor={colors.icon}
            value={code}
            onChangeText={setCode}
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
              onPress={handleResetPassword}
            >
              <ThemedText
                style={[styles.buttonText, { color: buttonTextColor }]}
              >
                Reset Password
              </ThemedText>
            </TouchableOpacity>
        </>
      )}

      <TouchableOpacity
        style={styles.linkButton}
        onPress={() => setView("login")}
      >
        <ThemedText style={[styles.linkText, { color: colors.tint }]}>
          Back to Login
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
