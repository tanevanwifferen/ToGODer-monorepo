import CustomAlert from './CustomAlert';

// Example usage:
export const showExampleAlert = () => {
  CustomAlert.alert(
    'Example Title',
    'This is an example message',
    [
      {
        text: 'Cancel',
        onPress: () => console.log('Cancel Pressed'),
        style: 'cancel',
      },
      {
        text: 'OK',
        onPress: () => console.log('OK Pressed'),
      },
    ],
    {
      cancelable: true,
      onDismiss: () => console.log('Alert dismissed'),
    }
  );
};

// Example with single button:
export const showSimpleAlert = () => {
  CustomAlert.alert('Success', 'Operation completed successfully', [
    {
      text: 'OK',
      onPress: () => console.log('OK Pressed'),
    },
  ]);
};

// Example with three buttons:
export const showThreeButtonAlert = () => {
  CustomAlert.alert('Delete Item', 'Are you sure you want to delete this item?', [
    {
      text: 'Cancel',
      onPress: () => console.log('Cancel Pressed'),
      style: 'cancel',
    },
    {
      text: 'Delete',
      onPress: () => console.log('Delete Pressed'),
      style: 'destructive',
    },
    {
      text: 'Archive Instead',
      onPress: () => console.log('Archive Pressed'),
    },
  ]);
};
