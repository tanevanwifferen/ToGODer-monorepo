import { IMessage } from 'react-native-gifted-chat';
import Clipboard from '@react-native-clipboard/clipboard';
import Toast from 'react-native-toast-message';
import CustomAlert from '@/components/ui/CustomAlert';

export const useChatActions = (
  messages: IMessage[],
  onDeleteMessage: (messageId: any) => void,
  onEditMessage?: (messageId: any, content: string) => void,
  onSpeakMessage?: (text: string) => void
) => {
  const showToast = (text: string) => {
    Toast.show({
      type: 'success',
      text1: text,
      position: 'bottom',
      visibilityTime: 2000,
    });
  };

  const onLongPress = (context: any, message: IMessage) => {
    const hasText = !!(message.text && message.text.trim());
    const options: string[] = ['Copy'];
    if (onSpeakMessage && hasText) options.push('Speak');
    options.push('Edit', 'Delete', 'Cancel');
    const cancelButtonIndex = options.length - 1;
    const destructiveButtonIndex = cancelButtonIndex - 1;

    context.actionSheet().showActionSheetWithOptions({
      options,
      cancelButtonIndex,
      destructiveButtonIndex,
    },
    (buttonIndex: number) => {
      const option = options[buttonIndex];
      switch (option) {
        case 'Copy':
          Clipboard.setString(message.text || '');
          showToast('Message copied to clipboard');
          break;
        case 'Speak':
          if (onSpeakMessage && message.text) {
            onSpeakMessage(message.text);
          }
          break;
        case 'Edit':
          if (onEditMessage) {
            onEditMessage(message._id, message.text || '');
            showToast('Message ready to edit');
          }
          break;
        case 'Delete':
          CustomAlert.alert(
            'Delete Message',
            'Are you sure you want to delete this message?',
            [
              {
                text: 'Cancel',
                style: 'cancel',
              },
              {
                text: 'Delete',
                style: 'destructive',
                onPress: () => {
                  onDeleteMessage(message._id);
                },
              },
            ],
          );
          break;
      }
    });
  };

  return {
    onLongPress
  };
};
