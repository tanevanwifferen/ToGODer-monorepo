import React, { useState } from 'react';
import { StyleSheet, Platform, View } from 'react-native';
import { ThemedText } from './ThemedText';
import { ThemedView } from './ThemedView';
import { CreateAccount } from './CreateAccount';
import { ForgotPassword } from './ForgotPassword';
import { ChangePassword } from './ChangePassword';
import { useAuth } from '../hooks/useAuth';
import { BalanceDisplay } from './login/BalanceDisplay';
import { LoginForm } from './login/LoginForm';
import { LoggedInView } from './login/LoggedInView';

export const Login = () => {
  const {
    email,
    setEmail,
    password,
    setPassword,
    error,
    isAuthenticated,
    handleLogin,
    handleLogout
  } = useAuth();
  
  const [view, setView] = useState<'login' | 'loggedIn' | 'createAccount' | 'forgotPassword' | 'changePassword'>(
    isAuthenticated ? 'loggedIn' : 'login'
  );

  const onLogin = async () => {
    const success = await handleLogin();
    if (success) {
      setView('loggedIn');
    }
  };

  const onLogout = async () => {
    if(await handleLogout()){
      setView('login');
    }
  };

  const containerStyle = Platform.OS === 'web' ? styles.webContainer : styles.container;
  const contentStyle = Platform.OS === 'web' ? styles.webContent : undefined;

  return (
    <ThemedView style={containerStyle}>
      <View style={contentStyle}>
        {error ? (
          <ThemedText style={styles.error}>{JSON.stringify(error)}</ThemedText>
        ) : null}

        {view === 'createAccount' && <CreateAccount setView={setView} />}

        {view === 'login' && (
          <LoginForm
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            onLogin={onLogin}
            onCreateAccount={() => setView('createAccount')}
            onForgotPassword={() => setView('forgotPassword')}
          />
        )}

        {view === 'forgotPassword' && <ForgotPassword setView={setView} />}

        {view === 'changePassword' && (
          <ChangePassword onBack={() => setView('loggedIn')} />
        )}

        {view === 'loggedIn' && (
          <>
            <BalanceDisplay isAuthenticated={isAuthenticated} />
            <LoggedInView
              email={email}
              onLogout={onLogout}
              onChangePassword={() => setView('changePassword')}
            />
          </>
        )}
      </View>
    </ThemedView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  webContainer: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  webContent: {
    width: '100%',
    maxWidth: 600,
  },
  error: {
    color: 'red',
    marginBottom: 15,
    textAlign: 'center',
  },
});
