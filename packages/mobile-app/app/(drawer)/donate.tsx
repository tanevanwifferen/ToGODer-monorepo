import React from 'react';
import { StyleSheet, TouchableOpacity, Linking, useColorScheme } from 'react-native';
import { useSelector } from 'react-redux';
import Clipboard from '@react-native-clipboard/clipboard';
import { selectDonateOptions } from '../../redux/slices/globalConfigSlice';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { DonateOption } from '../../model/GlobalConfig';
import { Colors } from '../../constants/Colors';
import CustomAlert from '@/components/ui/CustomAlert';

export default function DonateScreen() {
  const donateOptions = useSelector(selectDonateOptions);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme ?? 'light'];

  const handleDonatePress = async (option: DonateOption) => {
    if (option.url) {
      const supported = await Linking.canOpenURL(option.url);
      if (supported) {
        await Linking.openURL(option.url);
      } else {
        CustomAlert.alert('Error', `Cannot open URL: ${option.url}`);
      }
    } else {
      Clipboard.setString(option.address);
      CustomAlert.alert('Success', `${option.name} address copied to clipboard!`);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <ThemedText style={styles.title}>Carry the lantern</ThemedText>
      <ThemedText style={styles.subtitle}>
        The flame asks nothing. What you give, you give to the becoming — not to a product, but to a presence.
      </ThemedText>

      {donateOptions.map((option, index) => (
        <TouchableOpacity
          key={index}
          style={[styles.button, { backgroundColor: colors.tint }]}
          onPress={() => handleDonatePress(option)}
        >
          <ThemedText style={[styles.buttonText, { color: colorScheme === 'dark' ? '#1a1a1e' : '#faf8f2' }]}>{option.name}</ThemedText>
          <ThemedText style={[styles.addressText, { color: colorScheme === 'dark' ? '#1a1a1e' : '#faf8f2' }]}>{option.address}</ThemedText>
        </TouchableOpacity>
      ))}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
    opacity: 0.8,
  },
  button: {
    borderRadius: 8,
    padding: 15,
    marginBottom: 10,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 5,
  },
  addressText: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
  },
});
