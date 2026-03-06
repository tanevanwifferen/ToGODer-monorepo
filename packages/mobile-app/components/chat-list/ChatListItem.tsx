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
import { Chat } from "../../redux/slices/chatsSlice";

const formatLastUpdate = (timestamp?: number) => {
  if (!timestamp) return "";

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

// Theme-aware colors for better consistency
const getItemColors = (colorScheme: "light" | "dark") => ({
  cardBackground: colorScheme === "dark" ? "#1E1E1E" : "#FAFAFA",
  cardBorder: colorScheme === "dark" ? "#2A2A2A" : "#E5E5E5",
  requestBackground: colorScheme === "dark" ? "#2A2318" : "#FFF8F0",
  requestBorder: colorScheme === "dark" ? "#4A3A28" : "#F5D9B8",
  requestText: colorScheme === "dark" ? "#F5B878" : "#C87A2A",
  deleteBackground: colorScheme === "dark" ? "#3A2A2A" : "#FEF2F2",
  deleteText: colorScheme === "dark" ? "#F87171" : "#DC2626",
  deleteHover: colorScheme === "dark" ? "#4A3535" : "#FEE2E2",
  timestampText: colorScheme === "dark" ? "#6B7280" : "#9CA3AF",
});

interface ChatListItemProps {
  item: Chat;
  isRequest?: boolean;
  onSelect: (chatId: string) => void;
  onDelete: (chatId: string, title: string | null | undefined) => void;
  onLongPress?: (chatId: string) => void;
  projectName?: string | null;
}

const RightActions = ({
  progress,
  onDelete,
  itemId,
  itemTitle,
}: {
  progress: SharedValue<number>;
  onDelete: (id: string, title: string | null | undefined) => void;
  itemId: string;
  itemTitle: string | null | undefined;
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
        onPress={() => onDelete(itemId, itemTitle)}
        style={{ flex: 1, justifyContent: "center" }}
      >
        <Text style={styles.deleteActionText}>Delete</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

export function ChatListItem({
  item,
  isRequest,
  onSelect,
  onDelete,
  onLongPress,
  projectName,
}: ChatListItemProps) {
  const colorScheme = useColorScheme() ?? "light";
  const theme = Colors[colorScheme];
  const itemColors = getItemColors(colorScheme);

  if (Platform.OS === "web") {
    return (
      <View style={styles.chatItemContainer}>
        <TouchableOpacity
          style={[
            styles.chatItem,
            styles.chatItemWeb,
            {
              backgroundColor: itemColors.cardBackground,
              borderColor: itemColors.cardBorder,
            },
            isRequest && {
              backgroundColor: itemColors.requestBackground,
              borderColor: itemColors.requestBorder,
            },
          ]}
          onPress={() => onSelect(item.id)}
          onLongPress={() => onLongPress?.(item.id)}
          delayLongPress={500}
        >
          <View style={styles.chatItemContent}>
            <View style={styles.chatTitleRow}>
              <Text
                style={[
                  styles.chatTitle,
                  { color: theme.text },
                  isRequest && { color: itemColors.requestText },
                ]}
                numberOfLines={1}
              >
                {isRequest ? "🔔 " : ""}
                {item.title || "Untitled Chat"}
              </Text>
              <Text style={[styles.timestamp, { color: itemColors.timestampText }]}>
                {formatLastUpdate(item.messages[item.messages.length - 1]?.timestamp as number ?? new Date().getTime())}
              </Text>
            </View>
            {projectName && (
              <View style={styles.chatMetaRow}>
                <View
                  style={[
                    styles.projectBadge,
                    { backgroundColor: theme.tint + "15" },
                  ]}
                >
                  <Text
                    style={[styles.projectBadgeText, { color: theme.tint }]}
                    numberOfLines={1}
                  >
                    {projectName}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.webDeleteButton,
            { backgroundColor: itemColors.deleteBackground },
          ]}
          onPress={() => onDelete(item.id, item.title)}
        >
          <Text style={[styles.webDeleteButtonText, { color: itemColors.deleteText }]}>×</Text>
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
          itemTitle={item.title}
        ></RightActions>
      )}
      rightThreshold={0.3}
      onSwipeableOpen={(direction: "left" | "right") => {
        if (direction === "right") {
          onDelete(item.id, item.title);
        }
      }}
    >
      <Animated.View entering={SlideInRight}>
        <TouchableOpacity
          style={[
            styles.chatItem,
            {
              backgroundColor: itemColors.cardBackground,
              borderColor: itemColors.cardBorder,
              borderWidth: 1,
            },
            isRequest && {
              backgroundColor: itemColors.requestBackground,
              borderColor: itemColors.requestBorder,
            },
          ]}
          onPress={() => onSelect(item.id)}
          onLongPress={() => onLongPress?.(item.id)}
          delayLongPress={500}
        >
          <View style={styles.chatItemContent}>
            <View style={styles.chatTitleRow}>
              <Text
                style={[
                  styles.chatTitle,
                  { color: theme.text },
                  isRequest && { color: itemColors.requestText },
                ]}
                numberOfLines={1}
              >
                {isRequest ? "🔔 " : ""}
                {item.title || "Untitled Chat"}
              </Text>
              <Text style={[styles.timestamp, { color: itemColors.timestampText }]}>
                {formatLastUpdate(item.messages[item.messages.length - 1]?.timestamp as number ?? new Date().getTime())}
              </Text>
            </View>
            {projectName && (
              <View style={styles.chatMetaRow}>
                <View
                  style={[
                    styles.projectBadge,
                    { backgroundColor: theme.tint + "15" },
                  ]}
                >
                  <Text
                    style={[styles.projectBadgeText, { color: theme.tint }]}
                    numberOfLines={1}
                  >
                    {projectName}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  chatItem: {
    padding: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginBottom: 8,
  },
  chatItemWeb: {
    flex: 1,
    borderWidth: 1,
    // Web-specific shadow for depth
    ...Platform.select({
      web: {
        transition: "all 0.15s ease",
        cursor: "pointer",
      } as any,
    }),
  },
  chatTitle: {
    fontSize: 15,
    fontWeight: "500",
    flex: 1,
    letterSpacing: -0.2,
  },
  deleteAction: {
    backgroundColor: "#EF4444",
    justifyContent: "center",
    alignItems: "flex-end",
    width: 80,
    borderRadius: 10,
    marginLeft: 8,
  },
  deleteActionText: {
    color: "white",
    fontWeight: "600",
    fontSize: 14,
    padding: 16,
  },
  chatItemContainer: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 8,
    gap: 10,
  },
  webDeleteButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
    flexShrink: 0,
    alignSelf: "center",
  },
  webDeleteButtonText: {
    fontSize: 20,
    fontWeight: "500",
    lineHeight: 20,
  },
  chatItemContent: {
    flexDirection: "column",
    gap: 6,
  },
  chatTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  chatMetaRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  projectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  projectBadgeText: {
    fontSize: 11,
    fontWeight: "600",
    maxWidth: 120,
    letterSpacing: 0.2,
  },
  timestamp: {
    fontSize: 13,
    fontWeight: "400",
    flexShrink: 0,
  },
});
