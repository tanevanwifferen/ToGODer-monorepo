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

/** Regex matching togoder-image:// reference URLs */
const TOGODER_REF_RE = /togoder-image:\/\/[a-f0-9]{32}\?key=[^\s&]+&iv=[^\s&]+(?:&scheme=[^\s&]+)?/gi;

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
const TOGODER_MARKDOWN_RE = /!\[.*?\]\((togoder-image:\/\/[a-f0-9]{32}\?key=[^\s&]+&iv=[^\s&]+(?:&scheme=[^\s&]+)?)\)/gi;

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
  return BASE64_IMAGE_RE.test(content) || BARE_BASE64_RE.test(content);
}

/**
 * Extract all togoder-image:// reference IDs from message content.
 * Used by the sharing flow to collect images that need to be decrypted
 * and re-uploaded as unencrypted copies for shared recipients.
 */
export function extractImageRefs(content: string): string[] {
  const refs: string[] = [];
  const re = new RegExp(TOGODER_REF_RE.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    refs.push(match[0]);
  }
  return refs;
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
