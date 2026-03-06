/**
 * Layout for shared conversation routes.
 * Handles navigation configuration and screen options for shared routes.
 */

import { View } from 'react-native';
import { Stack } from 'expo-router';

export default function SharedLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Shared Conversations' }} />
        <Stack.Screen
          name="[id]"
          options={{
            title: undefined, // Will be set dynamically in the screen component
            headerShown: true
          }}
        />
      </Stack>
    </View>
  );
}