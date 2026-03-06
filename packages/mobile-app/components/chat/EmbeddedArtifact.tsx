import React, { useState } from "react";
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  useColorScheme,
  Platform,
} from "react-native";
import { useSelector } from "react-redux";
import { RootState } from "../../redux/store";
import { Colors } from "../../constants/Colors";
import { IconSymbol } from "../ui/IconSymbol";

interface EmbeddedArtifactProps {
  artifactId: string;
}

const MAX_PREVIEW_LINES = 8;
const MAX_PREVIEW_CHARS = 500;

export function EmbeddedArtifact({ artifactId }: EmbeddedArtifactProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const [isExpanded, setIsExpanded] = useState(false);

  const artifact = useSelector(
    (state: RootState) => state.artifacts.artifacts[artifactId]
  );

  if (!artifact) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background + "40" }]}>
        <Text style={[styles.errorText, { color: theme.text + "99" }]}>
          Artifact not found
        </Text>
      </View>
    );
  }

  const content = artifact.content || "";
  const isLongContent = content.length > MAX_PREVIEW_CHARS || content.split("\n").length > MAX_PREVIEW_LINES;

  const getPreviewContent = () => {
    if (isExpanded || !isLongContent) {
      return content;
    }
    const lines = content.split("\n").slice(0, MAX_PREVIEW_LINES);
    let preview = lines.join("\n");
    if (preview.length > MAX_PREVIEW_CHARS) {
      preview = preview.substring(0, MAX_PREVIEW_CHARS);
    }
    return preview + "...";
  };

  const iconName = artifact.type === "folder" ? "folder.fill" : "doc.text";

  return (
    <View style={[styles.container, { backgroundColor: colorScheme === "dark" ? "#1E1E1E" : "#F5F5F5" }]}>
      <View style={[styles.header, { borderBottomColor: theme.text + "20" }]}>
        <IconSymbol
          name={iconName}
          size={16}
          color={theme.tint}
          style={styles.icon}
        />
        <Text
          style={[styles.fileName, { color: theme.text }]}
          numberOfLines={1}
        >
          {artifact.name}
        </Text>
      </View>

      {artifact.type === "file" && content && (
        <View style={styles.contentContainer}>
          <Text
            style={[
              styles.content,
              { color: theme.text },
            ]}
          >
            {getPreviewContent()}
          </Text>

          {isLongContent && (
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setIsExpanded(!isExpanded)}
              activeOpacity={0.7}
            >
              <Text style={[styles.expandText, { color: theme.tint }]}>
                {isExpanded ? "Show less" : "Show more"}
              </Text>
              <IconSymbol
                name={isExpanded ? "chevron.up" : "chevron.down"}
                size={12}
                color={theme.tint}
              />
            </TouchableOpacity>
          )}
        </View>
      )}

      {artifact.type === "folder" && (
        <View style={styles.folderInfo}>
          <Text style={[styles.folderText, { color: theme.text + "99" }]}>
            Folder
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  icon: {
    marginRight: 8,
  },
  fileName: {
    fontSize: 13,
    fontWeight: "600",
    flex: 1,
  },
  contentContainer: {
    padding: 12,
  },
  content: {
    fontSize: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 18,
  },
  expandButton: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    paddingVertical: 4,
  },
  expandText: {
    fontSize: 12,
    fontWeight: "500",
    marginRight: 4,
  },
  folderInfo: {
    padding: 12,
  },
  folderText: {
    fontSize: 12,
    fontStyle: "italic",
  },
  errorText: {
    fontSize: 12,
    fontStyle: "italic",
    padding: 12,
  },
});
