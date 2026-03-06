import React from 'react';
import { TextInput, TouchableOpacity, StyleSheet, useColorScheme } from 'react-native';
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

  // In dark mode, use dark text since the button background (tint) is white
  // In light mode, use white text since the button background (tint) is blue
  const buttonTextColor = colorScheme === 'dark' ? '#151718' : '#fff';

  return (
    <>
      <TextInput
        style={[styles.input, { 
          backgroundColor: colors.background,
          borderColor: colorScheme === 'dark' ? colors.icon : '#ddd',
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
          borderColor: colorScheme === 'dark' ? colors.icon : '#ddd',
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
        <ThemedText style={[styles.buttonText, { color: buttonTextColor }]}>Login</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.button, { backgroundColor: colors.tint, marginTop: 15 }]}
        onPress={onCreateAccount}
      >
        <ThemedText style={[styles.buttonText, { color: buttonTextColor }]}>Create Account</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.linkButton}
        onPress={onForgotPassword}
      >
        <ThemedText style={[styles.linkText, { color: colors.tint }]}>
          Forgot Password?
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
  },
  linkButton: {
    marginTop: 15,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
  },
});
