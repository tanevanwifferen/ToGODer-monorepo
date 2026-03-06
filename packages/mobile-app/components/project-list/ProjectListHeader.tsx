import { StyleSheet, View, Text, TouchableOpacity, useColorScheme } from "react-native";
import { Colors } from "../../constants/Colors";

interface ProjectListHeaderProps {
  onNewProject: () => void;
}

export function ProjectListHeader({ onNewProject }: ProjectListHeaderProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  return (
    <View
      style={[
        styles.header,
        {
          borderBottomColor: colorScheme === "dark" ? "#2D2D2D" : "#e0e0e0",
        },
      ]}
    >
      <Text style={[styles.headerTitle, { color: theme.text }]}>Projects</Text>
      <TouchableOpacity
        style={[styles.newProjectButton, { backgroundColor: theme.tint }]}
        onPress={onNewProject}
      >
        <Text
          style={[
            styles.newProjectButtonText,
            { color: "#fff" },
          ]}
        >
          + New Project
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    padding: 16,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: "bold",
  },
  newProjectButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  newProjectButtonText: {
    fontSize: 16,
    fontWeight: "500",
  },
});
