import React from "react";
import { View } from "react-native";
import { MessageText } from "react-native-gifted-chat";
import { hasMermaid, parseMermaidSegments } from "./parseMermaid";
import { MermaidDiagram } from "./MermaidDiagram";
import {
  hasImages,
  parseImageSegments,
  InlineImage,
} from "../InlineImage";

// Derive the prop type from the component itself so we don't depend on the
// named `MessageTextProps` export, which isn't guaranteed across versions.
type MessageTextProps = React.ComponentProps<typeof MessageText>;

/**
 * Drop-in replacement for GiftedChat's `renderMessageText`. When a message
 * contains one or more ```mermaid fenced blocks, the surrounding prose is still
 * rendered with the default <MessageText> (preserving link handling and theming)
 * while each diagram is rendered with <MermaidDiagram>. Messages without a
 * diagram fall through to the default renderer unchanged.
 */
export function MessageWithMermaid(props: MessageTextProps) {
  const text = props.currentMessage?.text ?? "";
  const hasMermaidDiagrams = hasMermaid(text);
  const hasInlineImages = hasImages(text);

  // No special content — use default renderer
  if (!hasMermaidDiagrams && !hasInlineImages) {
    return <MessageText {...props} />;
  }

  // For messages with mermaid diagrams, use the existing mermaid-aware parser
  if (hasMermaidDiagrams) {
    const segments = parseMermaidSegments(text);

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

          // Check the text segment for inline images too
          if (hasImages(trimmed)) {
            return <ImageTextBlock key={`t-${index}`} text={trimmed} props={props} />;
          }

          return (
            <MessageText
              key={`t-${index}`}
              {...props}
              currentMessage={{ ...props.currentMessage!, text: trimmed }}
            />
          );
        })}
      </View>
    );
  }

  // For messages with only images (no mermaid), parse and render inline
  const imageSegments = parseImageSegments(text);

  return (
    <View>
      {imageSegments.map((segment, index) => {
        if (segment.type === "image") {
          return <InlineImage key={`img-${index}`} source={segment.value} />;
        }

        const trimmed = segment.value.replace(/^\s+|\s+$/g, "");
        if (trimmed.length === 0) {
          return null;
        }

        return (
          <MessageText
            key={`t-${index}`}
            {...props}
            currentMessage={{ ...props.currentMessage!, text: trimmed }}
          />
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
  props,
}: {
  text: string;
  props: MessageTextProps;
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
          <MessageText
            key={`t-${index}`}
            {...props}
            currentMessage={{ ...props.currentMessage!, text: trimmed }}
          />
        );
      })}
    </View>
  );
}
