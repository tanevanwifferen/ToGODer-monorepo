import React from 'react';
import { StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { useThemeColor } from '../hooks/useThemeColor';

interface DreamingViewProps {
  isDreaming: boolean;
}

export function DreamingView({ isDreaming }: DreamingViewProps) {
  const backgroundColor = useThemeColor({}, 'background');
  const textColor = useThemeColor({}, 'text');

  if (!isDreaming) {
    return null;
  }

  return (
    <View style={[styles.centeredView, { backgroundColor: backgroundColor + 'ee' }]}>
      <View style={styles.modalView}>
        <ActivityIndicator size="large" color={textColor} style={styles.spinner} />
        <Text style={[styles.text, { color: textColor }]}>
          Dreaming...
        </Text>
        <Text style={[styles.subText, { color: textColor }]}>
          Processing memories
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000, // Ensure it is above other content
  },
  modalView: {
    alignItems: 'center',
    padding: 35,
    backgroundColor: 'white',
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  spinner: {
    marginBottom: 20,
  },
  text: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subText: {
    fontSize: 16,
    opacity: 0.8,
  },
});
