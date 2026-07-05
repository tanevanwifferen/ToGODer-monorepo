import React, { useMemo, useState } from "react";
import { StyleSheet, useColorScheme, useWindowDimensions, View } from "react-native";
import { WebView, WebViewMessageEvent } from "react-native-webview";
import { buildMermaidHtml } from "./mermaidHtml";

interface MermaidDiagramProps {
  code: string;
}

// Upper bound on the self-reported height so semi-trusted (LLM-authored) content
// can't blow up the chat layout with an enormous diagram / fallback block.
const MAX_HEIGHT = 5000;

/**
 * Native (iOS / Android) Mermaid renderer. Renders the diagram inside an
 * isolated WebView and resizes itself to the reported content height.
 * The web build uses MermaidDiagram.web.tsx (an iframe) instead.
 */
export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const isDark = useColorScheme() === "dark";
  const { width: windowWidth } = useWindowDimensions();
  const [height, setHeight] = useState(120);
  const html = useMemo(() => buildMermaidHtml(code, isDark), [code, isDark]);

  // The WebView has no intrinsic width and lives inside a content-sized chat
  // bubble, so a percentage width would collapse to ~0. Use a concrete width.
  const width = Math.max(200, Math.min(windowWidth - 100, 900));

  const onMessage = (event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data?.type === "mermaid-height" && typeof data.height === "number" && data.height > 0) {
        setHeight(Math.min(Math.ceil(data.height) + 4, MAX_HEIGHT));
      }
    } catch {
      // ignore malformed messages
    }
  };

  // Defense-in-depth: only allow the inline document and the pinned CDN script;
  // veto any attempt by in-page JS to navigate the WebView elsewhere.
  const onShouldStartLoadWithRequest = (request: { url: string }) => {
    const url = request.url || "";
    return (
      url.startsWith("about:") ||
      url.startsWith("data:") ||
      url.startsWith("https://cdn.jsdelivr.net/")
    );
  };

  return (
    <View style={[styles.container, { width, height }]}>
      <WebView
        originWhitelist={["*"]}
        source={{ html }}
        style={styles.webview}
        scrollEnabled={false}
        scalesPageToFit={false}
        androidLayerType="software"
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
    borderRadius: 8,
    overflow: "hidden",
  },
  webview: {
    flex: 1,
    backgroundColor: "transparent",
  },
});
