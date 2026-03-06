import { openBrowserAsync } from 'expo-web-browser';
import { Platform, Pressable } from 'react-native';
import { DrawerItem } from '@react-navigation/drawer';
import { IconSymbol, IconSymbolName } from '../ui/IconSymbol';
import { useColorScheme } from '../../hooks/useColorScheme';
import { Colors } from '../../constants/Colors';

type Props = {
  href: string;
  title: string;
  iconName: IconSymbolName;
};

export function ExternalDrawerLink({ href, title, iconName }: Props) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const handlePress = async () => {
    await openBrowserAsync(href);
  };

  return (
    <DrawerItem
      label={title}
      onPress={handlePress}
      icon={({ color }) => (
        <IconSymbol size={28} name={iconName} color={color} />
      )}
      activeTintColor={theme.tint}
    />
  );
}
