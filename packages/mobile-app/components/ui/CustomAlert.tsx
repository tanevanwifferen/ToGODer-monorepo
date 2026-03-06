import { Alert, Platform } from 'react-native';

type AlertButton = {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
};

type AlertOptions = {
  cancelable?: boolean;
  onDismiss?: () => void;
};

const CustomAlert = {
  alert: (
    title: string,
    message?: string,
    buttons?: AlertButton[],
    options?: AlertOptions
  ): void => {
    if (Platform.OS === 'web') {
      // For web, create a custom implementation
      const hasConfirmButton = buttons?.some(
        (button) => button.style !== 'cancel'
      );
      const hasCancelButton = buttons?.some(
        (button) => button.style === 'cancel'
      );

      if (hasConfirmButton && hasCancelButton) {
        // If we have both confirm and cancel buttons, use confirm
        const confirmed = window.confirm(`${title}\n\n${message}`);
        const buttonToPress = buttons?.find(
          (button) =>
            (confirmed && button.style !== 'cancel') ||
            (!confirmed && button.style === 'cancel')
        );
        buttonToPress?.onPress?.();
      } else {
        // Otherwise use alert
        window.alert(`${title}\n\n${message}`);
        const buttonToPress = buttons?.[0];
        buttonToPress?.onPress?.();
      }

      // Handle onDismiss callback
      options?.onDismiss?.();
    } else {
      // For native platforms, use the built-in Alert
      Alert.alert(title, message, buttons, options);
    }
  },
};

export default CustomAlert;
