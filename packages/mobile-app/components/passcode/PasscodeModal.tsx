import React, { useState } from 'react';
import { Modal, StyleSheet, TextInput } from 'react-native';
import { useDispatch } from 'react-redux';
import { setPasscode } from '../../redux/slices/passcodeSlice';
import { ThemedText } from '../ThemedText';
import { ThemedView } from '../ThemedView';
import CustomAlert from '../ui/CustomAlert';

interface PasscodeModalProps {
  visible: boolean;
  onClose: () => void;
}

export function EditPasscodeModal({ visible, onClose }: PasscodeModalProps) {
  const dispatch = useDispatch();
  const [step, setStep] = useState<'set' | 'verify'>('set');
  const [passcode, setPasscodeValue] = useState('');
  const [verifyPasscode, setVerifyPasscode] = useState('');

  const handleSubmit = () => {
    if (step === 'set') {
      if (passcode.length !== 4) {
        CustomAlert.alert('Error', 'Passcode must be 4 digits');
        return;
      }
      setStep('verify');
    } else {
      if (passcode === verifyPasscode) {
        dispatch(setPasscode(passcode));
        CustomAlert.alert('Success', 'Passcode set successfully');
        onClose();
      } else {
        CustomAlert.alert('Error', 'Passcodes do not match');
        setPasscodeValue('');
        setVerifyPasscode('');
        setStep('set');
      }
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <ThemedView style={styles.container}>
        <ThemedView style={styles.content}>
          <ThemedText style={styles.title}>
            {step === 'set' ? 'Set Passcode' : 'Verify Passcode'}
          </ThemedText>
          <ThemedText style={styles.subtitle}>
            {step === 'set'
              ? 'Enter a 4-digit passcode'
              : 'Re-enter your passcode'}
          </ThemedText>
          
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            maxLength={4}
            secureTextEntry
            value={step === 'set' ? passcode : verifyPasscode}
            onChangeText={step === 'set' ? setPasscodeValue : setVerifyPasscode}
            onSubmitEditing={handleSubmit}
            autoFocus
          />
          
          {step === 'set' && passcode.length === 4 && (
            <ThemedText style={styles.button} onPress={() => setStep('verify')}>
              Next
            </ThemedText>
          )}
          
          {step === 'verify' && verifyPasscode.length === 4 && (
            <ThemedText style={styles.button} onPress={handleSubmit}>
              Set Passcode
            </ThemedText>
          )}
        </ThemedView>
      </ThemedView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  content: {
    width: '80%',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  input: {
    width: 200,
    height: 50,
    borderWidth: 1,
    borderRadius: 8,
    marginBottom: 20,
    fontSize: 24,
    textAlign: 'center',
    letterSpacing: 10,
  },
  button: {
    fontSize: 18,
    color: '#2196F3',
    fontWeight: '500',
  },
});
