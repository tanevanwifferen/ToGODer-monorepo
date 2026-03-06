import { useMemo } from "react";
import { StyleSheet, View, Text, useColorScheme } from "react-native";
import { useSelector } from "react-redux";
import { Colors } from "../../constants/Colors";
import { RootState } from "../../redux/store";
import { Artifact, selectAllArtifacts } from "../../redux/slices/artifactsSlice";
import { ArtifactTreeItem } from "./ArtifactTreeItem";

interface ArtifactTreeProps {
  projectId: string;
  onSelectArtifact?: (artifact: Artifact) => void;
  onLongPressArtifact?: (artifact: Artifact) => void;
}

export function ArtifactTree({
  projectId,
  onSelectArtifact,
  onLongPressArtifact,
}: ArtifactTreeProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];
  const allArtifacts = useSelector(selectAllArtifacts);

  // Filter artifacts for this project and organize by parent
  const projectArtifacts = useMemo(() => {
    return Object.values(allArtifacts).filter(
      (artifact) => artifact.projectId === projectId
    );
  }, [allArtifacts, projectId]);

  // Group artifacts by parentId for efficient lookup
  const artifactsByParent = useMemo(() => {
    const map: { [key: string]: Artifact[] } = { root: [] };

    for (const artifact of projectArtifacts) {
      const parentKey = artifact.parentId ?? "root";
      if (!map[parentKey]) {
        map[parentKey] = [];
      }
      map[parentKey].push(artifact);
    }

    // Sort each group: folders first, then alphabetically
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === "folder" ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
    }

    return map;
  }, [projectArtifacts]);

  const renderChildren = (parentId: string | null, level: number) => {
    const key = parentId ?? "root";
    const children = artifactsByParent[key] || [];

    return (
      <View>
        {children.map((artifact) => (
          <ArtifactTreeItem
            key={artifact.id}
            artifact={artifact}
            level={level}
            onSelect={onSelectArtifact}
            onLongPress={onLongPressArtifact}
            renderChildren={renderChildren}
          />
        ))}
      </View>
    );
  };

  if (projectArtifacts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={[styles.emptyText, { color: theme.text + "99" }]}>
          No artifacts yet
        </Text>
        <Text style={[styles.emptySubtext, { color: theme.text + "66" }]}>
          Artifacts created during chats will appear here
        </Text>
      </View>
    );
  }

  return <View style={styles.container}>{renderChildren(null, 0)}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  emptyContainer: {
    padding: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 14,
    textAlign: "center",
  },
});
