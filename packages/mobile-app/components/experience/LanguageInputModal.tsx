import { Modal, View, TextInput, Pressable, Text, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '../../redux/store';
import { setModalVisible } from '../../redux/slices/experienceSlice';
import { useState, useEffect } from 'react';
import { Colors } from '../../constants/Colors';

/**
 * Modal component for language input that maintains its own local state for text input
 * to prevent re-renders from affecting modal visibility.
 *
 * This component uses local state for the input text while typing, rather than updating
 * Redux on every keystroke. This prevents the modal from re-rendering and losing its
 * visibility state when the user types. The Redux state is only updated when the form
 * is submitted.
 */
interface LanguageInputModalProps {
  onSubmit: (language: string) => void;
}

export const LanguageInputModal = ({ onSubmit }: LanguageInputModalProps) => {
  const dispatch = useDispatch();
  const modalVisible = useSelector((state: RootState) => state.experience.modalVisible);
  const language = useSelector((state: RootState) => state.userSettings.language);
  
  // Use local state for the input text to prevent re-renders from Redux updates
  const [localLanguage, setLocalLanguage] = useState('');
  
  // Initialize local state when modal becomes visible
  useEffect(() => {
    if (modalVisible) {
      setLocalLanguage(language || '');
    }
  }, [modalVisible]);

  const handleSubmit = () => {
    if (localLanguage.trim()) {
      // Only update Redux when submitting
      onSubmit(localLanguage.trim());
      dispatch(setModalVisible(false));
    }
  };

  // Get the current color scheme (light or dark)
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme || 'light'];
  
  return (
    <Modal
      animationType="slide"
      transparent={true}
      visible={modalVisible}
      onRequestClose={() => dispatch(setModalVisible(false))}
    >
      <SafeAreaProvider>
        <SafeAreaView style={styles.centeredView}>
          <View style={[
            styles.modalView,
            { backgroundColor: colors.background }
          ]}>
            <Text style={[styles.title, { color: colors.text }]}>
              Language Settings
            </Text>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: colors.icon,
                  color: colors.text,
                  backgroundColor: colors.background
                }
              ]}
              placeholder="Enter language"
              placeholderTextColor={colors.text + '80'} // 50% opacity
              value={localLanguage}
              onChangeText={setLocalLanguage}
              autoFocus
              onSubmitEditing={handleSubmit}
            />
            <View style={styles.buttonContainer}>
              <Pressable
                style={[styles.button, { backgroundColor: colors.tint }]}
                onPress={handleSubmit}
              >
                <Text style={styles.buttonText}>Submit</Text>
              </Pressable>
              <Pressable
                style={[styles.button, { backgroundColor: colors.icon }]}
                onPress={() => dispatch(setModalVisible(false))}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </Modal>
  );
};

const styles = StyleSheet.create({
  centeredView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)'
  },
  modalView: {
    margin: 20,
    borderRadius: 20,
    padding: 35,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
    width: '80%'
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  input: {
    width: '100%',
    padding: 10,
    borderWidth: 1,
    borderRadius: 5,
    marginBottom: 15
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%'
  },
  button: {
    borderRadius: 20,
    padding: 10,
    elevation: 2,
    minWidth: 100,
    marginHorizontal: 5
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
    textAlign: 'center',
  }
});
