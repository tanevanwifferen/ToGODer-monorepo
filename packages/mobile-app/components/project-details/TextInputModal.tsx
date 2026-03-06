import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from "react-native";
import { Colors } from "../../constants/Colors";

interface TextInputModalProps {
  visible: boolean;
  title: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  onSubmit: (value: string) => void;
  onClose: () => void;
  validator?: (value: string) => string | null; // Returns error message or null if valid
}

export function TextInputModal({
  visible,
  title,
  placeholder = "",
  initialValue = "",
  submitLabel = "Create",
  onSubmit,
  onClose,
  validator,
}: TextInputModalProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setValue(initialValue);
      setError(null);
    }
  }, [visible, initialValue]);

  const handleSubmit = () => {
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setError("Name cannot be empty");
      return;
    }

    if (validator) {
      const validationError = validator(trimmedValue);
      if (validationError) {
        setError(validationError);
        return;
      }
    }

    onSubmit(trimmedValue);
    onClose();
  };

  const handleClose = () => {
    setValue("");
    setError(null);
    onClose();
  };

  const isValid = value.trim().length > 0 && (!validator || !validator(value.trim()));

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.overlay}
      >
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          <Text style={[styles.title, { color: theme.text }]}>{title}</Text>

          <TextInput
            style={[
              styles.input,
              {
                color: theme.text,
                borderColor: error ? "#ff4444" : theme.text + "33",
                backgroundColor: colorScheme === "dark" ? "#2D2D2D" : "#f5f5f5",
              },
            ]}
            value={value}
            onChangeText={(text) => {
              setValue(text);
              setError(null);
            }}
            placeholder={placeholder}
            placeholderTextColor={theme.text + "66"}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />

          {error && <Text style={styles.errorText}>{error}</Text>}

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.button,
                styles.cancelButton,
                { borderColor: theme.text + "33" },
              ]}
              onPress={handleClose}
            >
              <Text style={[styles.buttonText, { color: theme.text + "99" }]}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.button,
                styles.submitButton,
                { backgroundColor: theme.tint },
                !isValid && styles.disabledButton,
              ]}
              onPress={handleSubmit}
              disabled={!isValid}
            >
              <Text
                style={[
                  styles.buttonText,
                  { color: "#fff" },
                  !isValid && { opacity: 0.5 },
                ]}
              >
                {submitLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  container: {
    width: "85%",
    maxWidth: 400,
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
    marginBottom: 16,
    textAlign: "center",
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 8,
  },
  errorText: {
    color: "#ff4444",
    fontSize: 13,
    marginBottom: 8,
  },
  buttonRow: {
    flexDirection: "row",
    marginTop: 12,
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    borderWidth: 1,
  },
  submitButton: {},
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
