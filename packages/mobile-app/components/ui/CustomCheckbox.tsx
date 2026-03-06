import React from 'react';
import { View, StyleSheet, Pressable, Platform } from 'react-native';
import Checkbox from 'expo-checkbox';
import { Colors } from '../../constants/Colors';

interface CustomCheckboxProps {
  value: boolean;
  onValueChange: (value: boolean) => void;
  color?: string;
  colorScheme?: 'light' | 'dark' | null;
}

const CustomCheckbox: React.FC<CustomCheckboxProps> = ({ 
  value, 
  onValueChange, 
  color,
  colorScheme = 'light'
}) => {
  const theme = Colors[colorScheme ?? 'light'];

  if (Platform.OS === 'web') {
    return (
      <Pressable
        onPress={() => onValueChange(!value)}
        style={[
          styles.webCheckbox,
          {
            backgroundColor: value ? (color || theme.tint) : theme.background,
            borderColor: value ? (color || theme.tint) : theme.icon,
          }
        ]}
      >
        {value && (
          <View style={[styles.checkmark, { borderColor: '#fff' }]} />
        )}
      </Pressable>
    );
  }

  return (
    <Checkbox
      value={value}
      onValueChange={onValueChange}
      color={value ? (color || theme.tint) : undefined}
    />
  );
};

const styles = StyleSheet.create({
  webCheckbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmark: {
    width: 10,
    height: 6,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
    transform: [{ rotate: '-45deg' }],
    marginTop: -2,
  },
});

export default CustomCheckbox;
