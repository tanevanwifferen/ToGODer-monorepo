import { Link, Stack } from 'expo-router';
import { StyleSheet, View, useColorScheme } from 'react-native';

import { ThemedText } from '@/components/ThemedText';
import { ThemedView } from '@/components/ThemedView';
import { Colors } from '@/constants/Colors';
import React from "react";

export default function NotFoundScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme !== 'light';

  return (
    <>
      <Stack.Screen options={{ title: '' }} />
      <ThemedView style={styles.container}>
        <ThemedText type="title" style={styles.title}>Not all who wander are lost.</ThemedText>
        <View style={[styles.divider, { backgroundColor: isDark ? '#3a3020' : '#d4c5a0' }]} />
        <ThemedText style={styles.body}>
          This path leads nowhere. But the clearing is always near.
        </ThemedText>
        <Link href="/" style={styles.link}>
          <ThemedText type="link">Return to the still point</ThemedText>
        </Link>
      </ThemedView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  title: {
    textAlign: 'center',
    marginBottom: 16,
  },
  divider: {
    height: 1,
    width: 40,
    alignSelf: 'center',
    marginBottom: 16,
  },
  body: {
    fontSize: 16,
    lineHeight: 24,
    textAlign: 'center',
    opacity: 0.7,
  },
  link: {
    marginTop: 24,
    paddingVertical: 15,
  },
});
