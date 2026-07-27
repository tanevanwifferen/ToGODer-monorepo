import { ToolRegistry } from './ToolRegistry';
import {
  getOpenRouterClient,
  ImageGenResult,
  IMAGE_GEN_MODEL,
} from './OpenRouterClient';
import { storeEncryptedImage, storeAsymmetricallyEncryptedImage } from '../Services/ImageStore';

/**
 * Format for an image reference token embedded in the tool result and chat
 * history. The client parses these and fetches / decrypts the image.
 *
 * Symmetric (default):
 *   togoder-image://<id>?key=<base64key>&iv=<base64iv>
 *
 * Asymmetric (when client provides RSA public key):
 *   togoder-image://<id>?key=<rsa_encrypted_aes_key>&iv=<base64iv>&scheme=rsa
 *
 * These are ~200-600 chars vs ~100K+ for base64 — chat history and SSE stay
 * lightweight. The ciphertext lives only on disk.
 */
export interface ImageRef {
  url: string | null;
  /** togoder-image:// reference token when image was stored encrypted */
  imageRef: string | null;
  revisedPrompt: string | null;
  /** Ready-to-use markdown snippet for the LLM to inline in its response */
  markdown: string | null;
}

function buildImageRefToken(id: string, keyB64: string, ivB64: string, scheme?: string): string {
  const base = `togoder-image://${id}?key=${encodeURIComponent(keyB64)}&iv=${encodeURIComponent(ivB64)}`;
  return scheme ? `${base}&scheme=${encodeURIComponent(scheme)}` : base;
}

// ── Image blob download (temporary OpenRouter URLs → local buffer) ───

const DOWNLOAD_TIMEOUT_MS = 30_000;
const DOWNLOAD_MAX_RETRIES = 2;

/**
 * Download an image blob from a URL with timeout and exponential-backoff
 * retry. OpenRouter-hosted image URLs are temporary; this captures the
 * blob before it expires so the server can encrypt and persist it.
 */
async function downloadImageBlob(url: string): Promise<Buffer> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= DOWNLOAD_MAX_RETRIES; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

    try {
      console.log(
        `[image_download] Attempt ${attempt + 1}/${DOWNLOAD_MAX_RETRIES + 1} — ${url.slice(0, 80)}…`,
      );

      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      console.log(
        `[image_download] Success — ${(arrayBuffer.byteLength / 1024).toFixed(1)} KB`,
      );
      return Buffer.from(arrayBuffer);
    } catch (err: any) {
      lastError = err;
      const remaining = DOWNLOAD_MAX_RETRIES - attempt;

      if (err?.name === 'AbortError') {
        lastError = new Error(
          `Image download timed out after ${DOWNLOAD_TIMEOUT_MS / 1000}s`,
        );
      }

      if (remaining > 0) {
        const delay = 1_000 * Math.pow(2, attempt);
        console.warn(
          `[image_download] Attempt ${attempt + 1} failed, retrying in ${delay}ms: ${lastError?.message}`,
        );
        await new Promise((r) => setTimeout(r, delay));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  throw (
    lastError ??
    new Error(`Failed to download image after all retries`)
  );
}

/**
 * Register the `image_generate` backend tool.
 *
 * When the LLM calls image_generate, the handler sends the prompt to
 * OpenRouter's image generation endpoint and parses the response for images.
 *
 * Images with URLs (OpenRouter-hosted) are returned as-is. Images returned
 * as base64 are encrypted and stored on a bind-mount volume; only a compact
 * reference token is returned in the tool result. This keeps the chat history
 * and SSE stream free of large binary payloads.
 */
export function registerImageGenerateTool(): void {
  const registry = ToolRegistry.getInstance();

  registry.register(
    'image_generate',
    {
      type: 'function',
      function: {
        name: 'image_generate',
        description:
          'Generate an AI image from a text prompt using OpenRouter\'s gpt-image-2 model. ' +
          'The result JSON contains an "images" array; each image has a "markdown" ' +
          'field with a ready-to-render markdown snippet. YOU MUST include each ' +
          '"markdown" field verbatim in your response so the image renders inline. ' +
          'For example, if the result has images[0].markdown = ' +
          '"![Generated image](togoder-image://...)", copy that exact string into ' +
          'your message. Do NOT describe the image without including the markdown. ' +
          'Use this when the user asks you to create, draw, or generate an image.',
        parameters: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description:
                'A detailed description of the image to generate. ' +
                'Be specific about subject, style, composition, lighting, ' +
                'colors, and mood for best results.',
            },
            count: {
              type: 'number',
              description:
                'Number of images to request (1–4). Default 1. ' +
                'Higher counts may increase cost and latency.',
            },
          },
          required: ['prompt'],
        },
      },
    },
    async (ctx) => {
      const prompt = ctx.arguments.prompt;
      const count = Math.min(
        Math.max(Number(ctx.arguments.count) || 1, 1),
        Number(process.env.IMAGE_GEN_MAX_COUNT) || 4
      );

      if (typeof prompt !== 'string' || prompt.trim().length === 0) {
        return JSON.stringify({
          error: 'prompt parameter is required and must be a non-empty string.',
        });
      }

      const client = getOpenRouterClient({
        model: process.env.IMAGE_GEN_MODEL || IMAGE_GEN_MODEL,
        maxImages: count,
        timeoutMs: Number(process.env.IMAGE_GEN_TIMEOUT_MS) || 120_000,
      });

      // Append a count hint to the prompt so gpt-image-2 produces multiple
      // images when requested.
      const augmentedPrompt =
        count > 1
          ? `${prompt}\n\n[Generate ${count} distinct variations of this image.]`
          : prompt;

      try {
        const results = await client.generateImage(augmentedPrompt);

        if (results.length === 0) {
          return JSON.stringify({
            error:
              'Image generation completed but no images were returned. ' +
              'The model may not support the requested format or the prompt ' +
              'may have been rejected. Try rephrasing your prompt.',
          });
        }

        const images: ImageRef[] = await Promise.all(
          results.map(async (img: ImageGenResult, i: number) => {
            let imageRef: string | null = null;
            let markdown: string | null = null;

            if (img.url) {
              // OpenRouter-hosted image URL: download before it expires,
              // then encrypt & store (same pipeline as base64).
              try {
                const blob = await downloadImageBlob(img.url);
                const b64 = blob.toString('base64');
                const publicKey = ctx.request.imagePublicKey;
                let meta;
                if (publicKey) {
                  meta = storeAsymmetricallyEncryptedImage(b64, publicKey);
                } else {
                  meta = storeEncryptedImage(b64);
                }
                imageRef = buildImageRefToken(
                  meta.id,
                  meta.key,
                  meta.iv,
                  meta.scheme,
                );
                markdown = `![Generated image ${i + 1}](${imageRef})`;
              } catch (err: any) {
                console.error(
                  'Failed to download/store image from URL:',
                  err?.message ?? err,
                );
                // Fallback: embed the URL directly. It may expire, but
                // this keeps the chat from erroring out entirely.
                markdown = `![Generated image ${i + 1}](${img.url})`;
              }
            } else if (img.base64) {
              // Base64 image: encrypt & store on disk, return reference token.
              // Strip the data:image/...;base64, prefix if present.
              const b64 = img.base64.startsWith("data:")
                ? img.base64.split(",")[1]
                : img.base64;
              try {
                const publicKey = ctx.request.imagePublicKey;
                let meta;
                if (publicKey) {
                  // Asymmetric: server encrypts with client's RSA public key.
                  // Only the client (holding the private key) can decrypt.
                  meta = storeAsymmetricallyEncryptedImage(b64, publicKey);
                } else {
                  // Symmetric fallback: server generates AES key (can decrypt).
                  meta = storeEncryptedImage(b64);
                }
                imageRef = buildImageRefToken(
                  meta.id,
                  meta.key,
                  meta.iv,
                  meta.scheme,
                );
                markdown = `![Generated image ${i + 1}](${imageRef})`;
              } catch (err: any) {
                console.error(
                  "Failed to store encrypted image:",
                  err?.message ?? err,
                );
                // Fallback: include the base64 inline so the chat doesn't
                // break, but flag the error so the client knows it's legacy.
                markdown = img.base64.startsWith("data:")
                  ? `![Generated image ${i + 1}](${img.base64})`
                  : `![Generated image ${i + 1}](data:image/png;base64,${img.base64})`;
              }
            }

            return {
              url: img.url ?? null,
              imageRef,
              revisedPrompt: img.revisedPrompt ?? null,
              markdown,
            };
          },
        ));

        return JSON.stringify({
          success: true,
          images,
          count: results.length,
          model: process.env.IMAGE_GEN_MODEL || IMAGE_GEN_MODEL,
        });
      } catch (error: any) {
        console.error('image_generate tool error:', error?.message ?? error);
        return JSON.stringify({
          error: error?.message ?? 'Image generation failed unexpectedly.',
        });
      }
    }
  );
}
