import React from "react";
import { View } from "react-native";
import { MessageText } from "react-native-gifted-chat";
import { hasMermaid, parseMermaidSegments } from "./parseMermaid";
import { MermaidDiagram } from "./MermaidDiagram";

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

  if (!hasMermaid(text)) {
    return <MessageText {...props} />;
  }

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
