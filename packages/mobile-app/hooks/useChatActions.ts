import { IMessage } from 'react-native-gifted-chat';
import Clipboard from '@react-native-clipboard/clipboard';
import Toast from 'react-native-toast-message';
import CustomAlert from '@/components/ui/CustomAlert';

export const useChatActions = (
  messages: IMessage[],
  onDeleteMessage: (messageId: any) => void,
  onEditMessage?: (messageId: any, content: string) => void
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
    const options = ['Copy', 'Edit', 'Delete', 'Cancel'];
    const cancelButtonIndex = 3;
    const destructiveButtonIndex = 2;

    context.actionSheet().showActionSheetWithOptions({
      options,
      cancelButtonIndex,
      destructiveButtonIndex,
    },
    (buttonIndex: number) => {
      switch (buttonIndex) {
        case 0:
          Clipboard.setString(message.text || '');
          showToast('Message copied to clipboard');
          break;
        case 1:
          if (onEditMessage) {
            onEditMessage(message._id, message.text || '');
            showToast('Message ready to edit');
          }
          break;
        case 2:
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
