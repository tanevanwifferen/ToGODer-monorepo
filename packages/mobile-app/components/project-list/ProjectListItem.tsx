import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Platform,
  useColorScheme,
} from "react-native";
import { Colors } from "../../constants/Colors";
import Animated, {
  SlideInRight,
  useAnimatedStyle,
  interpolate,
  SharedValue,
} from "react-native-reanimated";
import Swipeable from "react-native-gesture-handler/ReanimatedSwipeable";
import { Project } from "../../redux/slices/projectsSlice";

const formatDate = (timestamp: number) => {
  const date = new Date(timestamp);
  const now = new Date();

  // Same day
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  // Same year
  if (date.getFullYear() === now.getFullYear()) {
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  // Different year
  return date.toLocaleDateString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

interface ProjectListItemProps {
  item: Project;
  onSelect: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

const RightActions = ({
  progress,
  onDelete,
  itemId,
}: {
  progress: SharedValue<number>;
  onDelete: (id: string) => void;
  itemId: string;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 1], [100, 0]);
    return {
      transform: [{ translateX }],
    };
  });

  return (
    <Animated.View style={[styles.deleteAction, animatedStyle]}>
      <TouchableOpacity
        onPress={() => onDelete(itemId)}
        style={{ flex: 1, justifyContent: "center" }}
      >
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

export function ProjectListItem({
  item,
  onSelect,
  onDelete,
}: ProjectListItemProps) {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? "light"];

  const chatCount = item.chatIds.length;
  const chatCountText = chatCount === 1 ? "1 chat" : `${chatCount} chats`;

  if (Platform.OS === "web") {
    return (
      <View style={styles.projectItemContainer}>
        <TouchableOpacity
          style={[
            styles.projectItem,
            {
              backgroundColor: colorScheme === "dark" ? "#2D2D2D" : "#f5f5f5",
              flex: 1,
            },
          ]}
          onPress={() => onSelect(item.id)}
        >
          <View style={styles.projectItemContent}>
            <View style={styles.projectInfo}>
              <Text style={[styles.projectTitle, { color: theme.text }]}>
                {item.name}
              </Text>
              {item.description && (
                <Text
                  style={[styles.projectDescription, { color: theme.text + "99" }]}
                  numberOfLines={1}
                >
                  {item.description}
                </Text>
              )}
            </View>
            <View style={styles.projectMeta}>
              <Text style={[styles.chatCount, { color: theme.tint }]}>
                {chatCountText}
              </Text>
              <Text style={[styles.timestamp, { color: theme.text + "99" }]}>
                {formatDate(item.updatedAt)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.webDeleteButton}
          onPress={() => onDelete(item.id)}
        >
          <Text style={styles.webDeleteButtonText}>×</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <Swipeable
      renderRightActions={(progress) => (
        <RightActions
          progress={progress}
          onDelete={onDelete}
          itemId={item.id}
        />
      )}
      rightThreshold={0.3}
      onSwipeableOpen={(direction: "left" | "right") => {
        if (direction === "right") {
          onDelete(item.id);
        }
      }}
    >
      <Animated.View entering={SlideInRight}>
        <TouchableOpacity
          style={[
            styles.projectItem,
            {
              backgroundColor: colorScheme === "dark" ? "#2D2D2D" : "#f5f5f5",
            },
          ]}
          onPress={() => onSelect(item.id)}
        >
          <View style={styles.projectItemContent}>
            <View style={styles.projectInfo}>
              <Text style={[styles.projectTitle, { color: theme.text }]}>
                {item.name}
              </Text>
              {item.description && (
                <Text
                  style={[styles.projectDescription, { color: theme.text + "99" }]}
                  numberOfLines={1}
                >
                  {item.description}
                </Text>
              )}
            </View>
            <View style={styles.projectMeta}>
              <Text style={[styles.chatCount, { color: theme.tint }]}>
                {chatCountText}
              </Text>
              <Text style={[styles.timestamp, { color: theme.text + "99" }]}>
                {formatDate(item.updatedAt)}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  projectItem: {
    padding: 16,
    borderRadius: 8,
    marginBottom: 12,
  },
  projectTitle: {
    fontSize: 16,
    fontWeight: "500",
  },
  projectDescription: {
    fontSize: 14,
    marginTop: 4,
  },
  deleteAction: {
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "flex-end",
    width: 100,
    borderRadius: 8,
  },
  deleteActionText: {
    color: "white",
    fontWeight: "600",
    padding: 20,
  },
  projectItemContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 8,
  },
  webDeleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FF3B30",
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
  },
  webDeleteButtonText: {
    color: "white",
    fontSize: 24,
    fontWeight: "bold",
    lineHeight: 24,
  },
  projectItemContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  projectInfo: {
    flex: 1,
    marginRight: 12,
  },
  projectMeta: {
    alignItems: "flex-end",
  },
  chatCount: {
    fontSize: 12,
    fontWeight: "500",
  },
  timestamp: {
    fontSize: 12,
    marginTop: 4,
  },
});
