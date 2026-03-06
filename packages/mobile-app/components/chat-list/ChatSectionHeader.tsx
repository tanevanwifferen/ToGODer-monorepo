import { StyleSheet, View, Text, useColorScheme } from "react-native";
import { Colors } from "../../constants/Colors";

interface ChatSectionHeaderProps {
  title: string;
}

export function ChatSectionHeader({ title }: ChatSectionHeaderProps) {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];

  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionHeaderText, { color: theme.icon }]}>
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeader: {
    paddingTop: 4,
    paddingBottom: 10,
    marginBottom: 4,
  },
  sectionHeaderText: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
});
