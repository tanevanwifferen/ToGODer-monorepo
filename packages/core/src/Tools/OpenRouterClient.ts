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
  /** Maximum API call timeout in ms (default 60000) */
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

const DEFAULT_TIMEOUT_MS = 60_000;
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
   * Generate images using OpenRouter's /api/v1/images endpoint via the
   * OpenAI SDK's images.generate() method.
   *
   * gpt-image-2 is an image generation model and must be called through
   * the images API, not chat/completions.
   */
  async generateImage(prompt: string): Promise<ImageGenResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    try {
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

      return data.map((img) => ({
        url: img.url ?? undefined,
        base64: img.b64_json ?? undefined,
        revisedPrompt: (img as any).revised_prompt ?? undefined,
      }));
    } catch (error: any) {
      if (error?.name === 'AbortError' || controller.signal.aborted) {
        throw new Error(
          `Image generation timed out after ${this.config.timeoutMs}ms. ` +
            'Try a shorter prompt or try again.'
        );
      }

      const status = error?.status ?? error?.response?.status;
      const body = error?.error ?? error?.response?.data;

      // Rate limit handling (429)
      if (status === 429) {
        const retryAfter = error?.response?.headers?.['retry-after'];
        throw new Error(
          'OpenRouter rate limit reached. ' +
            (retryAfter
              ? `Retry after ${retryAfter} seconds.`
              : 'Please wait and try again.')
        );
      }

      // Content policy rejection (400 / content_filter)
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

      // Payment / billing error (402)
      if (status === 402) {
        throw new Error(
          'OpenRouter account requires credits to generate images. ' +
            'Please add credits at https://openrouter.ai/credits'
        );
      }

      // Generic error
      console.error('OpenRouter image generation error:', {
        status,
        message: error?.message,
        body,
      });
      throw new Error(
        `Image generation failed: ${error?.message ?? 'Unknown error'}`
      );
    } finally {
      clearTimeout(timeout);
    }
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
