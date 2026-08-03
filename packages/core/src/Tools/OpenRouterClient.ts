import OpenAI from 'openai';

/**
 * Default model for image generation via OpenRouter.
 */
export const IMAGE_GEN_MODEL = 'openai/gpt-image-2';

/**
 * Configuration for the OpenRouter image generation client.
 */
export interface ImageGenConfig {
  /** OpenRouter model slug (defaults to openai/gpt-image-2) */
  model?: string;
  /** Maximum images to request per call (default 1) */
  maxImages?: number;
  /** Maximum API call timeout in ms (default 120000) */
  timeoutMs?: number;
}

/**
 * Parsed image result from an image generation response.
 */
export interface ImageGenResult {
  /** URL to the image (OpenRouter-hosted) */
  url?: string;
  /** Base64-encoded image data (data:image/... URI) */
  base64?: string;
  /** Optional revised prompt returned by the model */
  revisedPrompt?: string;
}

const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_MAX_IMAGES = 1;

/**
 * Lightweight, reusable OpenRouter HTTP client for non-streaming API calls
 * (image generation and other one-shot requests).
 *
 * Follows the same patterns as OpenRouterWrapper (OpenAI SDK pointed at
 * OpenRouter's base URL), but stripped down for direct API usage outside the
 * chat streaming pipeline.
 */
export class OpenRouterClient {
  private openai: OpenAI;
  private config: ImageGenConfig;

  constructor(config: ImageGenConfig = {}) {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OpenRouter API key (process.env.OPENROUTER_API_KEY) is required'
      );
    }

    this.openai = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://chat.togoder.click',
        'X-Title': 'ToGODer',
      },
    });

    this.config = {
      model: IMAGE_GEN_MODEL,
      maxImages: DEFAULT_MAX_IMAGES,
      timeoutMs: DEFAULT_TIMEOUT_MS,
      ...config,
    };
  }

  /**
   * Whether an error is retryable (timeout/network/5xx) or permanent
   * (content filter, billing, etc).
   */
  private isRetryable(error: any): boolean {
    if (error?.name === 'AbortError') return true;
    const status = error?.status ?? error?.response?.status;
    // 429 (rate limit), 5xx (server error), or network errors
    if (status === 429) return true;
    if (status && status >= 500 && status < 600) return true;
    // Network-level errors (no status) are retryable
    if (!status) return true;
    // Content filter (400), billing (402) — not retryable
    return false;
  }

  /**
   * Generate images using OpenRouter's /api/v1/images endpoint via the
   * OpenAI SDK's images.generate() method.
   *
   * gpt-image-2 is an image generation model and must be called through
   * the images API, not chat/completions.
   *
   * Includes exponential backoff retry: up to 2 retries (3 total attempts)
   * with delays of 2s, then 4s between attempts.
   */
  async generateImage(prompt: string): Promise<ImageGenResult[]> {
    const maxRetries = 2; // 3 total attempts
    const baseDelayMs = 2_000;
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
      );

      try {
        console.log(
          `[image_generate] Attempt ${attempt + 1}/${maxRetries + 1} ` +
            `(model: ${this.config.model ?? IMAGE_GEN_MODEL}, ` +
            `timeout: ${this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms)`
        );

        const response = await this.openai.images.generate(
          {
            model: this.config.model ?? IMAGE_GEN_MODEL,
            prompt,
            n: this.config.maxImages ?? DEFAULT_MAX_IMAGES,
            size: '1024x1024',
            response_format: 'url',
          },
          { signal: controller.signal }
        );

        const data = response.data ?? [];
        if (data.length === 0) {
          throw new Error('Image generation returned no images');
        }

        console.log(
          `[image_generate] Success on attempt ${attempt + 1} — ${data.length} image(s)`
        );

        return data.map((img) => ({
          url: img.url ?? undefined,
          base64: img.b64_json ?? undefined,
          revisedPrompt: (img as any).revised_prompt ?? undefined,
        }));
      } catch (error: any) {
        clearTimeout(timeout);
        lastError = error;

        const isRetryable = this.isRetryable(error);
        const remaining = maxRetries - attempt;

        if (isRetryable && remaining > 0) {
          const delay = baseDelayMs * Math.pow(2, attempt);
          console.warn(
            `[image_generate] Attempt ${attempt + 1} failed (retryable), ` +
              `retrying in ${delay}ms (${remaining} retries left): ` +
              `${error?.message ?? error}`
          );
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }

        if (!isRetryable) {
          console.warn(
            `[image_generate] Attempt ${attempt + 1} failed (non-retryable): ` +
              `${error?.message ?? error}`
          );
        } else {
          console.error(
            `[image_generate] All ${maxRetries + 1} attempts exhausted.`
          );
        }

        // Build the final user-facing error
        if (error?.name === 'AbortError') {
          throw new Error(
            `Image generation timed out after ${this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS}ms ` +
              `(${attempt + 1} attempt(s) made). Try a shorter prompt or try again later.`
          );
        }

        const status = error?.status ?? error?.response?.status;
        const body = error?.error ?? error?.response?.data;

        if (status === 429) {
          throw new Error(
            'OpenRouter rate limit reached. Please wait and try again.'
          );
        }

        if (
          status === 400 &&
          typeof body === 'object' &&
          body?.code === 'content_filter'
        ) {
          throw new Error(
            'Image generation was blocked by the content policy. ' +
              'Please rephrase your prompt and try again.'
          );
        }

        if (status === 402) {
          throw new Error(
            'OpenRouter account requires credits to generate images. ' +
              'Please add credits at https://openrouter.ai/credits'
          );
        }

        console.error('OpenRouter image generation error:', {
          status,
          message: error?.message,
          body,
        });
        throw new Error(
          `Image generation failed after ${attempt + 1} attempt(s): ` +
            `${error?.message ?? 'Unknown error'}`
        );
      } finally {
        clearTimeout(timeout);
      }
    }

    // Should be unreachable — the loop always throws or returns
    throw lastError ?? new Error('Image generation failed unexpectedly.');
  }
}

/** Singleton instance, lazily created */
let clientInstance: OpenRouterClient | null = null;

/**
 * Get or create the shared OpenRouterClient instance.
 * Uses OPENROUTER_API_KEY from the environment.
 */
export function getOpenRouterClient(config?: ImageGenConfig): OpenRouterClient {
  if (!clientInstance) {
    clientInstance = new OpenRouterClient(config);
  }
  return clientInstance;
}
