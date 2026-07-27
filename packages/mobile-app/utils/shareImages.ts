/**
 * Client-side share-image helper.
 *
 * When a user shares a chat, images stored as togoder-image:// references
 * must be decrypted locally and re-uploaded as unencrypted copies so
 * the shared recipient can view them without the original user's private key.
 *
 * Flow:
 * 1. Extract all togoder-image:// refs from the message content
 * 2. Fetch each encrypted blob from the server (GET /api/chat/blob)
 * 3. Decrypt each blob locally using the embedded key + private key
 * 4. Send decrypted images to POST /api/chat/share-images
 * 5. Receive resolvedContent with public URLs replacing the refs
 * 6. Persist the resolvedContent in the shared chat
 *
 * The private key NEVER leaves the client.
 */

import { fetchAndDecryptImage, parseImageRef, extractAllImageRefs } from './imageCrypto';
import { getApiUrl } from '../constants/Env';

export interface ShareImageInput {
  /** Original reference URL (togoder-image://...) */
  ref: string;
  /** Decrypted base64 image data (no data: prefix) */
  data: string;
}

export interface ShareImageResult {
  /** Message content with all reference URLs replaced by public URLs */
  resolvedContent: string;
  /** Mapping from original ref to public URL */
  urls: Record<string, string>;
}

/**
 * Decrypt all images referenced in message content and prepare them for
 * sharing. Returns the share payload ready to send to POST /api/chat/share-images.
 *
 * @param content Original message content with togoder-image:// references
 * @returns Array of {ref, data} objects with decrypted base64 image data
 */
export async function prepareImagesForSharing(
  content: string,
): Promise<ShareImageInput[]> {
  const refs = extractAllImageRefs(content);
  if (refs.length === 0) return [];

  const apiBase = getApiUrl();
  const results: ShareImageInput[] = [];

  for (const ref of refs) {
    const dataUri = await fetchAndDecryptImage(ref, apiBase);
    if (!dataUri) continue; // skip images that couldn't be decrypted

    // Strip the data:image/...;base64, prefix — server expects raw base64
    const b64 = dataUri.includes(';base64,')
      ? dataUri.split(';base64,')[1]
      : dataUri;
    results.push({ ref, data: b64 });
  }

  return results;
}

/**
 * Complete the share flow: decrypt images, upload to server, get resolved
 * content back. This is the main function the share UI should call.
 *
 * @param content Original message content with togoder-image:// references
 * @param apiBase Optional override for API base URL
 * @returns Resolved content with public image URLs, or original content on failure
 */
export async function shareImages(
  content: string,
  apiBase?: string,
): Promise<ShareImageResult | null> {
  const images = await prepareImagesForSharing(content);
  if (images.length === 0) {
    // No images to share — content is already safe as-is
    return { resolvedContent: content, urls: {} };
  }

  try {
    const base = apiBase || getApiUrl();
    const resp = await fetch(`${base}/chat/share-images`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images, content }),
    });

    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}
