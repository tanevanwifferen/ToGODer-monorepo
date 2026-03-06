import { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { Colors } from "../../constants/Colors";
import { IconSymbol } from "../ui/IconSymbol";
import { Artifact } from "../../redux/slices/artifactsSlice";

interface ArtifactTreeItemProps {
  artifact: Artifact;
  children?: Artifact[];
  level: number;
  onSelect?: (artifact: Artifact) => void;
  onLongPress?: (artifact: Artifact) => void;
  renderChildren: (parentId: string, level: number) => React.ReactNode;
}

export function ArtifactTreeItem({
  artifact,
  level,
  onSelect,
  onLongPress,
  renderChildren,
}: ArtifactTreeItemProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const [isExpanded, setIsExpanded] = useState(false);

  const isFolder = artifact.type === "folder";
  const indentWidth = level * 16;

  const handlePress = () => {
    if (isFolder) {
      setIsExpanded(!isExpanded);
    }
    onSelect?.(artifact);
  };

  const iconName = isFolder
    ? isExpanded
      ? "folder.fill"
      : "folder"
    : "doc.text";

  return (
    <View>
      <TouchableOpacity
        style={[styles.itemContainer, { paddingLeft: indentWidth + 8 }]}
        onPress={handlePress}
        onLongPress={() => onLongPress?.(artifact)}
        activeOpacity={0.7}
      >
        {isFolder && (
          <IconSymbol
            name="chevron.right"
            size={12}
            color={theme.text + "99"}
            style={[
              styles.chevron,
              { transform: [{ rotate: isExpanded ? "90deg" : "0deg" }] },
            ]}
          />
        )}
        {!isFolder && <View style={styles.chevronPlaceholder} />}
        <IconSymbol
          name={iconName}
          size={18}
          color={isFolder ? theme.tint : theme.text + "CC"}
          style={styles.icon}
        />
        <Text
          style={[styles.itemName, { color: theme.text }]}
          numberOfLines={1}
        >
          {artifact.name}
        </Text>
      </TouchableOpacity>
      {isFolder && isExpanded && renderChildren(artifact.id, level + 1)}
    </View>
  );
}

const styles = StyleSheet.create({
  itemContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    paddingRight: 16,
  },
  chevron: {
    marginRight: 4,
  },
  chevronPlaceholder: {
    width: 12,
    marginRight: 4,
  },
  icon: {
    marginRight: 8,
  },
  itemName: {
    fontSize: 14,
    flex: 1,
  },
});
