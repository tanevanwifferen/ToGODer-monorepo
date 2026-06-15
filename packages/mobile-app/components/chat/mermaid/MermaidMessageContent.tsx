import React from "react";
import { StyleProp, TextStyle, View } from "react-native";
import { ThemedText } from "../../ThemedText";
import { hasMermaid, parseMermaidSegments } from "./parseMermaid";
import { MermaidDiagram } from "./MermaidDiagram";

interface MermaidMessageContentProps {
  content: string;
  textStyle?: StyleProp<TextStyle>;
}

/**
 * Renders message content outside of GiftedChat (e.g. the shared-conversation
 * read view), turning ```mermaid fenced blocks into diagrams while rendering the
 * surrounding prose with <ThemedText>. Use MessageWithMermaid inside GiftedChat.
 */
export function MermaidMessageContent({ content, textStyle }: MermaidMessageContentProps) {
  if (!hasMermaid(content)) {
    return <ThemedText style={textStyle}>{content}</ThemedText>;
  }

  const segments = parseMermaidSegments(content);

  return (
    <View>
      {segments.map((segment, index) => {
        if (segment.type === "mermaid") {
          return <MermaidDiagram key={`m-${index}`} code={segment.value} />;
        }
        const trimmed = segment.value.replace(/^\s+|\s+$/g, "");
        if (trimmed.length === 0) {
          return null;
        }
        return (
          <ThemedText key={`t-${index}`} style={textStyle}>
            {trimmed}
          </ThemedText>
        );
      })}
    </View>
  );
}
