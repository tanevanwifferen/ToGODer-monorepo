import { IMessage } from 'react-native-gifted-chat';
import Clipboard from '@react-native-clipboard/clipboard';
import Toast from 'react-native-toast-message';
import CustomAlert from '@/components/ui/CustomAlert';
import { useChatActions } from '../useChatActions';

// Mock dependencies
jest.mock('@react-native-clipboard/clipboard', () => ({
  setString: jest.fn(),
}));

jest.mock('react-native-toast-message', () => ({
  show: jest.fn(),
}));

jest.mock('@/components/ui/CustomAlert', () => ({
  __esModule: true,
  default: {
    alert: jest.fn(),
  },
}));

describe('useChatActions', () => {
  const mockOnDeleteMessage = jest.fn();
  const mockShowActionSheetWithOptions = jest.fn();

  const mockContext = {
    actionSheet: () => ({
      showActionSheetWithOptions: mockShowActionSheetWithOptions,
    }),
  };

  const createMessage = (overrides?: Partial<IMessage>): IMessage => ({
    _id: 'msg-1',
    text: 'Test message content',
    createdAt: new Date(),
    user: { _id: 'user-1' },
    ...overrides,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('onLongPress', () => {
    it('should show action sheet with correct options', () => {
      const messages: IMessage[] = [createMessage()];
      const { onLongPress } = useChatActions(messages, mockOnDeleteMessage);
      const message = createMessage();

      onLongPress(mockContext, message);

      expect(mockShowActionSheetWithOptions).toHaveBeenCalledWith(
        {
          options: ['Copy', 'Edit', 'Delete', 'Cancel'],
          cancelButtonIndex: 3,
          destructiveButtonIndex: 2,
        },
        expect.any(Function)
      );
    });

    describe('copy action (index 0)', () => {
      it('should copy message text to clipboard', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage);
        const message = createMessage({ text: 'Copy this text' });

        onLongPress(mockContext, message);

        // Get the callback and invoke with copy index (0)
        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(0);

        expect(Clipboard.setString).toHaveBeenCalledWith('Copy this text');
      });

      it('should handle empty message text', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage);
        const message = createMessage({ text: undefined });

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(0);

        expect(Clipboard.setString).toHaveBeenCalledWith('');
      });

      it('should show success toast after copying', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage);
        const message = createMessage();

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(0);

        expect(Toast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: 'Message copied to clipboard',
          position: 'bottom',
          visibilityTime: 2000,
        });
      });
    });

    describe('delete action (index 2)', () => {
      it('should show confirmation alert', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage);
        const message = createMessage({ _id: 'msg-to-delete' });

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(2);

        expect(CustomAlert.alert).toHaveBeenCalledWith(
          'Delete Message',
          'Are you sure you want to delete this message?',
          expect.arrayContaining([
            expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
            expect.objectContaining({ text: 'Delete', style: 'destructive' }),
          ])
        );
      });

      it('should call onDeleteMessage when delete is confirmed', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage);
        const message = createMessage({ _id: 'msg-to-delete' });

        onLongPress(mockContext, message);

        const actionSheetCallback = mockShowActionSheetWithOptions.mock.calls[0][1];
        actionSheetCallback(2);

        // Get the alert buttons and find the Delete button
        const alertButtons = (CustomAlert.alert as jest.Mock).mock.calls[0][2];
        const deleteButton = alertButtons.find((btn: any) => btn.text === 'Delete');

        // Simulate pressing Delete
        deleteButton.onPress();

        expect(mockOnDeleteMessage).toHaveBeenCalledWith('msg-to-delete');
      });

      it('should not call onDeleteMessage when cancel is pressed', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage);
        const message = createMessage({ _id: 'msg-to-delete' });

        onLongPress(mockContext, message);

        const actionSheetCallback = mockShowActionSheetWithOptions.mock.calls[0][1];
        actionSheetCallback(2);

        // Get the alert buttons and find the Cancel button
        const alertButtons = (CustomAlert.alert as jest.Mock).mock.calls[0][2];
        const cancelButton = alertButtons.find((btn: any) => btn.text === 'Cancel');

        // Cancel button has no onPress, so nothing should happen
        expect(cancelButton.onPress).toBeUndefined();
        expect(mockOnDeleteMessage).not.toHaveBeenCalled();
      });
    });

    describe('cancel action (index 3)', () => {
      it('should not perform any action when cancel is selected', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage);
        const message = createMessage();

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(3);

        expect(Clipboard.setString).not.toHaveBeenCalled();
        expect(CustomAlert.alert).not.toHaveBeenCalled();
        expect(mockOnDeleteMessage).not.toHaveBeenCalled();
      });
    });
  });

  describe('with onEditMessage provided', () => {
    const mockOnEditMessage = jest.fn();

    beforeEach(() => {
      mockOnEditMessage.mockClear();
    });

    it('should show action sheet with Edit option', () => {
      const messages: IMessage[] = [createMessage()];
      const { onLongPress } = useChatActions(messages, mockOnDeleteMessage, mockOnEditMessage);
      const message = createMessage();

      onLongPress(mockContext, message);

      expect(mockShowActionSheetWithOptions).toHaveBeenCalledWith(
        {
          options: ['Copy', 'Edit', 'Delete', 'Cancel'],
          cancelButtonIndex: 3,
          destructiveButtonIndex: 2,
        },
        expect.any(Function)
      );
    });

    describe('edit action (index 1)', () => {
      it('should call onEditMessage with message id and content', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage, mockOnEditMessage);
        const message = createMessage({ _id: 'msg-to-edit', text: 'Edit this' });

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(1);

        expect(mockOnEditMessage).toHaveBeenCalledWith('msg-to-edit', 'Edit this');
      });

      it('should show toast after edit action', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage, mockOnEditMessage);
        const message = createMessage({ _id: 'msg-to-edit', text: 'Edit this' });

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(1);

        expect(Toast.show).toHaveBeenCalledWith({
          type: 'success',
          text1: 'Message ready to edit',
          position: 'bottom',
          visibilityTime: 2000,
        });
      });

      it('should handle empty message text for edit', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage, mockOnEditMessage);
        const message = createMessage({ _id: 'msg-to-edit', text: undefined });

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(1);

        expect(mockOnEditMessage).toHaveBeenCalledWith('msg-to-edit', '');
      });
    });

    describe('copy action (index 0)', () => {
      it('should still copy message text to clipboard', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage, mockOnEditMessage);
        const message = createMessage({ text: 'Copy this text' });

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(0);

        expect(Clipboard.setString).toHaveBeenCalledWith('Copy this text');
        expect(Toast.show).toHaveBeenCalled();
      });
    });

    describe('delete action (index 2)', () => {
      it('should show confirmation alert', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage, mockOnEditMessage);
        const message = createMessage({ _id: 'msg-to-delete' });

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(2);

        expect(CustomAlert.alert).toHaveBeenCalledWith(
          'Delete Message',
          'Are you sure you want to delete this message?',
          expect.arrayContaining([
            expect.objectContaining({ text: 'Cancel', style: 'cancel' }),
            expect.objectContaining({ text: 'Delete', style: 'destructive' }),
          ])
        );
      });

      it('should call onDeleteMessage when delete is confirmed', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage, mockOnEditMessage);
        const message = createMessage({ _id: 'msg-to-delete' });

        onLongPress(mockContext, message);

        const actionSheetCallback = mockShowActionSheetWithOptions.mock.calls[0][1];
        actionSheetCallback(2);

        const alertButtons = (CustomAlert.alert as jest.Mock).mock.calls[0][2];
        const deleteButton = alertButtons.find((btn: any) => btn.text === 'Delete');
        deleteButton.onPress();

        expect(mockOnDeleteMessage).toHaveBeenCalledWith('msg-to-delete');
      });
    });

    describe('cancel action (index 3)', () => {
      it('should not perform any action when cancel is selected', () => {
        const messages: IMessage[] = [createMessage()];
        const { onLongPress } = useChatActions(messages, mockOnDeleteMessage, mockOnEditMessage);
        const message = createMessage();

        onLongPress(mockContext, message);

        const callback = mockShowActionSheetWithOptions.mock.calls[0][1];
        callback(3);

        expect(Clipboard.setString).not.toHaveBeenCalled();
        expect(CustomAlert.alert).not.toHaveBeenCalled();
        expect(mockOnDeleteMessage).not.toHaveBeenCalled();
        expect(mockOnEditMessage).not.toHaveBeenCalled();
      });
    });
  });

  describe('edit action without onEditMessage', () => {
    it('should not throw when edit is selected but no handler provided', () => {
      const messages: IMessage[] = [createMessage()];
      const { onLongPress } = useChatActions(messages, mockOnDeleteMessage);
      const message = createMessage();

      onLongPress(mockContext, message);

      const callback = mockShowActionSheetWithOptions.mock.calls[0][1];

      // This should not throw even though onEditMessage is not provided
      expect(() => callback(1)).not.toThrow();
    });
  });
});
