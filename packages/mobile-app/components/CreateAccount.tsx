import React, { useState } from 'react';
import { TextInput, StyleSheet, TouchableOpacity, useColorScheme } from 'react-native';
import { useDispatch } from 'react-redux';
import { AuthApiClient } from '../apiClients/AuthApiClient';
import { setAuthData } from '../redux/slices/authSlice';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { Colors } from '../constants/Colors';

export const CreateAccount = ({setView}: {setView:(view: "login"|"loggedIn"|"createAccount") => void}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const dispatch = useDispatch();
  
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];
  const buttonTextColor = colorScheme === 'dark' ? '#151718' : '#fff';

  const validateForm = () => {
    if (!email || !password || !confirmPassword) {
      setError('All fields are required');
      return false;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return false;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return false;
    }
    return true;
  };

  const handleCreateAccount = async () => {
    try {
      setError('');
      if (!validateForm()) return;

      const response = await AuthApiClient.createUser(email, password);
      dispatch(setAuthData({ email, password, ...response }));
      setError("Account created successfully, please verify by opening the link on your email.");
    } catch (err: any) {
      setError(err.toString());
    }
  };

  return (
    <ThemedView style={styles.container}>
      {error ? (
        <ThemedText style={[styles.error, { color: colorScheme === 'dark' ? '#ff6b6b' : 'red' }]}>
          {error}
        </ThemedText>
      ) : null}
      
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

      <TextInput
        style={[styles.input, {
          backgroundColor: colors.background,
          borderColor: colorScheme === 'dark' ? colors.icon : '#ddd',
          color: colors.text
        }]}
        placeholder="Confirm Password"
        placeholderTextColor={colors.icon}
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />
      
      <TouchableOpacity 
        style={[styles.button, { backgroundColor: colors.tint }]}
        onPress={handleCreateAccount}
      >
        <ThemedText style={[styles.buttonText, { color: buttonTextColor }]}>Create Account</ThemedText>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.linkButton}
        onPress={() => setView('login')}
      >
        <ThemedText style={[styles.linkText, { color: colors.tint }]}>
          Already have an account? Login
        </ThemedText>
      </TouchableOpacity>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    marginBottom: 15,
    textAlign: 'center',
  },
  linkButton: {
    marginTop: 15,
    alignItems: 'center',
  },
  linkText: {
    fontSize: 14,
  },
});
