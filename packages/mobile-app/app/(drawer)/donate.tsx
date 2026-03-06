import React from 'react';
import { StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useSelector } from 'react-redux';
import Clipboard from '@react-native-clipboard/clipboard';
import { selectDonateOptions } from '../../redux/slices/globalConfigSlice';
import { ThemedText } from '../../components/ThemedText';
import { ThemedView } from '../../components/ThemedView';
import { DonateOption } from '../../model/GlobalConfig';
import CustomAlert from '@/components/ui/CustomAlert';

export default function DonateScreen() {
  const donateOptions = useSelector(selectDonateOptions);

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
      <ThemedText style={styles.title}>Support ToGODer</ThemedText>
      <ThemedText style={styles.subtitle}>Your support helps keep ToGODer running and improving!</ThemedText>
      
      {donateOptions.map((option, index) => (
        <TouchableOpacity
          key={index}
          style={styles.button}
          onPress={() => handleDonatePress(option)}
        >
          <ThemedText style={styles.buttonText}>{option.name}</ThemedText>
          <ThemedText style={styles.addressText}>{option.address}</ThemedText>
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
    backgroundColor: '#2196F3',
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
