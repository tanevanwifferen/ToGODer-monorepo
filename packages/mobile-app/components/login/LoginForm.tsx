import React from 'react';
import { TextInput, TouchableOpacity, StyleSheet, useColorScheme, View } from 'react-native';
import { ThemedText } from '../ThemedText';
import { Colors } from '../../constants/Colors';

interface LoginFormProps {
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  onLogin: () => void;
  onCreateAccount: () => void;
  onForgotPassword: () => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({
  email,
  setEmail,
  password,
  setPassword,
  onLogin,
  onCreateAccount,
  onForgotPassword,
}) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const isDark = colorScheme !== 'light';

  // Button text: contrast against the tint background
  const buttonTextColor = isDark ? '#1a1a1e' : '#faf8f2';

  return (
    <>
      {/* Threshold text */}
      <View style={styles.threshold}>
        <ThemedText style={styles.thresholdTitle}>Enter the clearing</ThemedText>
        <View style={[styles.thresholdDivider, { backgroundColor: isDark ? '#3a3020' : '#d4c5a0' }]} />
        <ThemedText style={styles.thresholdBody}>
          This is not a login. It is a crossing.{"\n"}
          The presence does not demand — it simply awaits.
        </ThemedText>
      </View>

      <TextInput
        style={[styles.input, {
          backgroundColor: colors.background,
          borderColor: isDark ? '#3a3020' : '#d4c5a0',
          color: colors.text
        }]}
        placeholder="Email"
        placeholderTextColor={colors.icon}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      <TextInput
        style={[styles.input, {
          backgroundColor: colors.background,
          borderColor: isDark ? '#3a3020' : '#d4c5a0',
          color: colors.text
        }]}
        placeholder="Password"
        placeholderTextColor={colors.icon}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.tint }]}
        onPress={onLogin}
      >
        <ThemedText style={[styles.buttonText, { color: buttonTextColor }]}>Cross the threshold</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.tint, marginTop: 15 }]}
        onPress={onCreateAccount}
      >
        <ThemedText style={[styles.buttonText, { color: buttonTextColor }]}>Begin</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={onForgotPassword}
      >
        <ThemedText style={[styles.linkText, { color: colors.tint }]}>
          Forgot your way?
        </ThemedText>
      </TouchableOpacity>
    </>
  );
};

const styles = StyleSheet.create({
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
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
    letterSpacing: 2,
  },
  linkButton: {
    marginTop: 15,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
  },
  threshold: {
    alignItems: 'center',
    marginBottom: 32,
  },
  thresholdTitle: {
    fontSize: 28,
    fontWeight: '300',
    letterSpacing: 4,
    marginBottom: 12,
  },
  thresholdDivider: {
    height: 1,
    width: 40,
    marginBottom: 16,
  },
  thresholdBody: {
    fontSize: 14,
    lineHeight: 22,
    textAlign: 'center',
    opacity: 0.7,
  },
});
