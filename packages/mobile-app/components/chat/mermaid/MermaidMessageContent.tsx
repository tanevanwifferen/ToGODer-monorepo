import React from "react";
import { StyleProp, TextStyle, View } from "react-native";
import { ThemedText } from "../../ThemedText";
import { hasMermaid, parseMermaidSegments } from "./parseMermaid";
import { MermaidDiagram } from "./MermaidDiagram";
import {
  hasImages,
  parseImageSegments,
  InlineImage,
} from "../InlineImage";

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
  // Plain text without mermaid or images — simplest path
  if (!hasMermaid(content) && !hasImages(content)) {
    return <ThemedText style={textStyle}>{content}</ThemedText>;
  }

  // When mermaid diagrams are present, use the mermaid-aware parser which
  // splits into text and diagram segments; in the text segments we also
  // check for inline images.
  if (hasMermaid(content)) {
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
          // Check the text segment for inline images
          if (hasImages(trimmed)) {
            return (
              <ImageTextBlock
                key={`t-${index}`}
                text={trimmed}
                textStyle={textStyle}
              />
            );
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

  // Images only (no mermaid)
  const imageSegments = parseImageSegments(content);

  return (
    <View>
      {imageSegments.map((segment, index) => {
        if (segment.type === "image") {
          return <InlineImage key={`img-${index}`} source={segment.value} />;
        }
        const trimmed = segment.value.replace(/^\s+|\s+$/g, "");
        if (trimmed.length === 0) return null;
        return (
          <ThemedText key={`t-${index}`} style={textStyle}>
            {trimmed}
          </ThemedText>
        );
      })}
    </View>
  );
}

/**
 * Render a text block that may contain inline images, splitting text
 * around image URLs and rendering images inline.
 */
function ImageTextBlock({
  text,
  textStyle,
}: {
  text: string;
  textStyle?: StyleProp<TextStyle>;
}) {
  const segments = parseImageSegments(text);

  return (
    <View>
      {segments.map((segment, index) => {
        if (segment.type === "image") {
          return <InlineImage key={`img-${index}`} source={segment.value} />;
        }
        const trimmed = segment.value.replace(/^\s+|\s+$/g, "");
        if (trimmed.length === 0) return null;
        return (
          <ThemedText key={`t-${index}`} style={textStyle}>
            {trimmed}
          </ThemedText>
        );
      })}
    </View>
  );
}
