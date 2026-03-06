import React from "react";
import {
  TouchableOpacity,
  StyleSheet,
  Alert,
  useColorScheme,
  Platform,
} from "react-native";
import { ThemedText } from "../ThemedText";
import { usePasscode } from "../../hooks/usePasscode";

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

  return (
    <>
      <ThemedText style={styles.email}>{email}</ThemedText>
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
});
