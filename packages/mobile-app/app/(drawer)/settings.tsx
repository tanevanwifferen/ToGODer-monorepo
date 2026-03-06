import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useColorScheme } from 'react-native';
import { Colors } from '../../constants/Colors';
import ModelSettings from '../../components/settings/ModelSettings';
import ConversationSettings from '../../components/settings/ConversationSettings';
import SystemPromptSettings from '../../components/settings/SystemPromptSettings';

const Settings = () => {
  const colorScheme = useColorScheme();
  const containerStyle = Platform.OS === 'web' ? styles.webContainer : styles.container;
  const contentStyle = Platform.OS === 'web' ? styles.webContent : undefined;

  return (
    <View style={[containerStyle, { backgroundColor: Colors[colorScheme ?? 'light'].background }]}>
      <ScrollView style={[contentStyle]}>
        <ModelSettings />
        <ConversationSettings />
        <SystemPromptSettings />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webContainer: {
    flex: 1,
    alignItems: 'center',
  },
  webContent: {
    width: '100%',
    maxWidth: 600,
    flex: 1,
  },
});

export default Settings;
