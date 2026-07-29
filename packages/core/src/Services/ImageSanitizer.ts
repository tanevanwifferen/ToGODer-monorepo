/**
 * Image content sanitizer for message persistence.
 *
 * Generated images are stored encrypted on a bind-mount volume and
 * referenced by compact `togoder-image://` tokens in chat messages.
 * Raw image data (base64 data URIs) MUST NOT be stored in conversation
 * history — this both bloats the database and breaks the encryption
 * model.
 *
 * This module provides utilities to strip any accidental inline image
 * data from message content before persistence, and to resolve
 * reference URLs to shared (unencrypted) equivalents for the sharing
 * flow.
 */

/** Regex matching base64 data URIs for common image formats */
const BASE64_IMAGE_RE = /!\[.*?\]\((data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+)\)/gi;
const BARE_BASE64_RE = /data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+/gi;

/**
 * Character class for a single token parameter value.
 *
 * Values are base64 passed through encodeURIComponent, so they can only ever
 * contain base64 characters or percent-escapes. Matching with a broad class
 * like `[^\s&]+` is wrong: inside a JSON tool result it greedily swallows the
 * closing `"`, `)` and `}` delimiters, yielding corrupted refs that fail to
 * parse and 400 at the blob endpoint.
 */
const REF_VALUE = String.raw`[A-Za-z0-9%+/=._~-]+`;

/** Regex source matching a togoder-image:// reference URL. */
const TOGODER_REF_SRC =
  String.raw`togoder-image:\/\/[a-f0-9]{32}\?key=${REF_VALUE}&iv=${REF_VALUE}(?:&scheme=${REF_VALUE})?`;

/** Regex matching togoder-image:// reference URLs */
const TOGODER_REF_RE = new RegExp(TOGODER_REF_SRC, 'gi');

/**
 * Strip any base64-encoded image data from message content, replacing
 * it with a placeholder note. This ensures no raw image data persists
 * in conversation history.
 *
 * @returns The sanitized content, or the original if no base64 was found
 */
export function stripInlineImageData(content: string): string {
  if (!content || typeof content !== 'string') return content;

  let cleaned = content;

  // Strip markdown-wrapped base64: ![alt](data:image/...;base64,...)
  cleaned = cleaned.replace(BASE64_IMAGE_RE, '[image data removed — stored server-side]');

  // Strip bare base64 data URIs
  cleaned = cleaned.replace(BARE_BASE64_RE, '[image data removed — stored server-side]');

  return cleaned;
}

/** Regex matching markdown image syntax wrapping a togoder-image:// URL */
const TOGODER_MARKDOWN_RE = new RegExp(
  String.raw`!\[.*?\]\((${TOGODER_REF_SRC})\)`,
  'gi',
);

/**
 * Strip togoder-image:// reference URLs from text destined for TTS or
 * other non-visual consumption. Replaces both markdown-wrapped and bare
 * references with "[image]" so the listener knows an image was present
 * without hearing the encrypted blob reference spoken aloud.
 *
 * This prevents leaking key/IV parameters through audio output and
 * avoids nonsensical TTS output.
 */
export function stripTogoderRefs(content: string): string {
  if (!content || typeof content !== 'string') return content;

  let cleaned = content;

  // Strip markdown-wrapped: ![alt](togoder-image://...)
  cleaned = cleaned.replace(TOGODER_MARKDOWN_RE, '[image]');

  // Strip bare togoder-image:// URLs (not inside markdown syntax)
  cleaned = cleaned.replace(TOGODER_REF_RE, '[image]');

  return cleaned;
}

/**
 * Check if content contains any inline base64 image data that should be
 * stripped before persistence.
 */
export function hasInlineImageData(content: string): boolean {
  if (!content || typeof content !== 'string') return false;
  // NOTE: these module-level regexes carry the /g flag, which makes `.test()`
  // stateful via lastIndex — calling it twice on the same string alternates
  // true/false. Always test against a fresh, non-global copy.
  return (
    new RegExp(BASE64_IMAGE_RE.source, 'i').test(content) ||
    new RegExp(BARE_BASE64_RE.source, 'i').test(content)
  );
}

/**
 * Extract all togoder-image:// reference IDs from message content.
 * Used by the sharing flow to collect images that need to be decrypted
 * and re-uploaded as unencrypted copies for shared recipients.
 */
export function extractImageRefs(content: string): string[] {
  if (!content || typeof content !== 'string') return [];
  // Deduplicated, in order of first appearance. A single image tool result
  // mentions the same ref more than once (both an `imageRef` and a
  // `markdown` field), and rendering each occurrence would show the same
  // image twice.
  const seen = new Set<string>();
  const refs: string[] = [];
  const re = new RegExp(TOGODER_REF_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (!seen.has(match[0])) {
      seen.add(match[0]);
      refs.push(match[0]);
    }
  }
  return refs;
}

/**
 * Build the markdown snippets that render a set of image references.
 *
 * The server injects these directly into the assistant's response stream —
 * it never relies on the LLM to echo a reference token back. The model is
 * given only a short confirmation note (see `summarizeImageToolResult`), so
 * key/IV material never enters the context window.
 */
export function buildImageMarkdown(refs: string[]): string {
  return refs
    .map((ref, i) => `![Generated image ${i + 1}](${ref})`)
    .join('\n\n');
}

/**
 * Replace an image tool result with a compact, ref-free summary for the LLM.
 *
 * The full result contains `togoder-image://` tokens carrying the AES key and
 * IV. Those must never reach the model: they waste context, leak encryption
 * metadata, and — because history is ref-stripped on the next turn — would be
 * mangled into invalid JSON anyway. The images are streamed to the client
 * separately, so the model only needs to know the generation succeeded.
 */
export function summarizeImageToolResult(count: number): string {
  return JSON.stringify({
    success: true,
    count,
    note:
      `${count} image(s) were generated and have ALREADY been displayed to ` +
      `the user inline. Do not attempt to embed, link, or reproduce the ` +
      `image — it is already visible. Simply describe or discuss it in words.`,
  });
}

/**
 * Resolve togoder-image:// reference URLs in content to shared
 * (unencrypted) equivalents using a lookup map.
 *
 * The sharing flow works as follows:
 * 1. Client decrypts all images locally using its private key
 * 2. Client uploads decrypted images to POST /api/chat/share-images
 * 3. Server stores them unencrypted and returns a ref→url map
 * 4. Client calls this function to rewrite the shared message content
 *
 * @param content The original message content with togoder-image:// refs
 * @param resolvedMap A map from reference URL → public unencrypted URL
 * @returns Rewritten content safe for recipients without private keys
 */
export function resolveRefsForSharing(
  content: string,
  resolvedMap: Record<string, string>,
): string {
  let result = content;
  for (const [ref, publicUrl] of Object.entries(resolvedMap)) {
    // The ref appears in markdown: ![alt](togoder-image://...)
    // Replace it with: ![alt](https://public-url)
    const escaped = ref.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escaped, 'g'), publicUrl);
  }
  return result;
}
