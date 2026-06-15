import React, { useEffect, useMemo, useRef, useState } from "react";
import { useColorScheme, useWindowDimensions } from "react-native";
import { buildMermaidHtml } from "./mermaidHtml";

interface MermaidDiagramProps {
  code: string;
}

// Upper bound on the self-reported height so semi-trusted (LLM-authored) content
// can't blow up the chat layout with an enormous diagram / fallback block.
const MAX_HEIGHT = 5000;

/**
 * Web Mermaid renderer. Uses a sandboxed iframe (allow-scripts only, so it runs
 * as an opaque origin and cannot touch the host page) whose document renders the
 * diagram and posts its height back via `postMessage`.
 */
export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const isDark = useColorScheme() === "dark";
  const { width: windowWidth } = useWindowDimensions();
  const [height, setHeight] = useState(120);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const html = useMemo(() => buildMermaidHtml(code, isDark), [code, isDark]);

  // An <iframe> at width:"100%" inside the content-sized chat bubble resolves
  // against an indefinite base and falls back to its 300px intrinsic width.
  // Use a concrete width matching the native renderer.
  const width = Math.max(200, Math.min(windowWidth - 100, 900));

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (data?.type === "mermaid-height" && typeof data.height === "number" && data.height > 0) {
          setHeight(Math.min(Math.ceil(data.height) + 4, MAX_HEIGHT));
        }
      } catch {
        // ignore malformed messages
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      title="mermaid-diagram"
      sandbox="allow-scripts"
      style={{
        width,
        height,
        border: "none",
        borderRadius: 8,
        marginTop: 6,
        marginBottom: 6,
        background: "transparent",
      }}
    />
  );
}
