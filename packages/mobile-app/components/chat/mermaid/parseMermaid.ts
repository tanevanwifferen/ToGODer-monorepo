/**
 * Splits assistant message content into plain-text and Mermaid-diagram
 * segments. A Mermaid segment is a fenced code block tagged `mermaid`:
 *
 *     ```mermaid
 *     graph TD; A-->B;
 *     ```
 *
 * Only *closed* fences are treated as diagrams, so a diagram that is still
 * streaming in (no closing fence yet) renders as text until it completes.
 */
export type MermaidSegment =
  | { type: "text"; value: string }
  | { type: "mermaid"; value: string };

// `[\s\S]` matches across newlines; non-greedy body stops at the next fence.
const MERMAID_FENCE = /```mermaid[ \t]*\r?\n([\s\S]*?)```/g;

export function parseMermaidSegments(content: string): MermaidSegment[] {
  const segments: MermaidSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  MERMAID_FENCE.lastIndex = 0;
  while ((match = MERMAID_FENCE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: content.slice(lastIndex, match.index) });
    }
    segments.push({ type: "mermaid", value: match[1].trim() });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", value: content.slice(lastIndex) });
  }

  // No fences at all -> single text segment (callers may short-circuit).
  return segments.length > 0 ? segments : [{ type: "text", value: content }];
}

export function hasMermaid(content: string): boolean {
  MERMAID_FENCE.lastIndex = 0;
  return MERMAID_FENCE.test(content);
}
