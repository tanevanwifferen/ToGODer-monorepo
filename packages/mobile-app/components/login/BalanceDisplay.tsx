import React from 'react';
import { ActivityIndicator, StyleSheet, useColorScheme } from 'react-native';
import { ThemedText } from '../ThemedText';
import { ThemedView } from '../ThemedView';
import { useBalance } from '../../hooks/useBalance';
import { Colors } from '../../constants/Colors';

interface BalanceDisplayProps {
  isAuthenticated: boolean;
}

export const BalanceDisplay: React.FC<BalanceDisplayProps> = ({ isAuthenticated }) => {
  const {
    balance,
    globalBalance,
    isLoading: isBalanceLoading,
    error: balanceError,
  } = useBalance();

  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  if (!isAuthenticated) return null;

  if (isBalanceLoading) {
    return (
      <ThemedView style={[styles.balanceContainer, { 
        backgroundColor: colorScheme === 'dark' ? 'rgba(155, 161, 166, 0.1)' : '#f5f5f5'
      }]}>
        <ActivityIndicator size="small" color={colors.tint} />
      </ThemedView>
    );
  }

  if (balanceError) {
    return (
      <ThemedView style={[styles.balanceContainer, { 
        backgroundColor: colorScheme === 'dark' ? 'rgba(155, 161, 166, 0.1)' : '#f5f5f5'
      }]}>
        <ThemedText style={[styles.balanceError, { color: colorScheme === 'dark' ? '#ff6b6b' : 'red' }]}>
          Failed to load balance
        </ThemedText>
      </ThemedView>
    );
  }

  return (
    <>
    <ThemedView style={[styles.balanceContainer, { 
      backgroundColor: colorScheme === 'dark' ? 'rgba(155, 161, 166, 0.1)' : '#f5f5f5'
    }]}>
      <ThemedText style={styles.balanceLabel}>Donated Balance:</ThemedText>
      <ThemedText style={[styles.balanceValue, { color: colors.tint }]}>
        ${Number(globalBalance).toFixed(2)}
      </ThemedText>
    </ThemedView>
    <ThemedView style={[styles.balanceContainer, { 
      backgroundColor: colorScheme === 'dark' ? 'rgba(155, 161, 166, 0.1)' : '#f5f5f5'
    }]}>
      <ThemedText style={styles.balanceLabel}>Balance:</ThemedText>
      <ThemedText style={[styles.balanceValue, { color: colors.tint }]}>
        ${Number(balance).toFixed(2)}
      </ThemedText>
    </ThemedView>
    </>
  );
};

const styles = StyleSheet.create({
  balanceContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    padding: 10,
    borderRadius: 8,
  },
  balanceLabel: {
    fontSize: 16,
    marginRight: 8,
  },
  balanceValue: {
    fontSize: 18,
    fontWeight: '600',
  },
  balanceError: {
    fontSize: 14,
  },
});
