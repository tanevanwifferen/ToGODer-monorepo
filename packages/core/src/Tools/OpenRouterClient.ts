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
   * Generate images using OpenRouter's chat/completions with an image-capable
   * model (e.g. openai/gpt-image-2). Returns parsed image results (URLs and/or
   * base64 data URIs).
   *
   * The model is prompted to produce images and returns them inline in its
   * response content. We parse the content for image URLs and base64 data.
   */
  async generateImage(prompt: string): Promise<ImageGenResult[]> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.config.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

    try {
      const response = await this.openai.chat.completions.create(
        {
          model: this.config.model ?? IMAGE_GEN_MODEL,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 4096,
        },
        { signal: controller.signal }
      );

      const content = response.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Image generation returned empty response');
      }

      return this.parseImageResponse(content);
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

  /**
   * Parse the model's text response for image URLs and base64 data URIs.
   *
   * gpt-image-2 returns images in markdown format like:
   *   ![image](https://...)
   * Or inline base64 data URIs.
   */
  private parseImageResponse(content: string): ImageGenResult[] {
    const results: ImageGenResult[] = [];

    // Match markdown image syntax: ![alt](url)
    const markdownImageRe = /!\[.*?\]\((https?:\/\/[^\s)]+)\)/g;
    let match: RegExpExecArray | null;
    while ((match = markdownImageRe.exec(content)) !== null) {
      results.push({ url: match[1] });
    }

    // Match base64 data URIs for images
    const base64Re = /(data:image\/[a-zA-Z+.-]+;base64,[A-Za-z0-9+/=]+)/g;
    while ((match = base64Re.exec(content)) !== null) {
      results.push({ base64: match[1] });
    }

    // If no structured images found, wrap the full content as a single result
    // (the model may return plain text instructions or error messages)
    if (results.length === 0) {
      // The content may contain a URL without markdown syntax
      const plainUrlRe = /(https?:\/\/[^\s]+\.(?:png|jpg|jpeg|gif|webp)(?:\?[^\s]*)?)/gi;
      while ((match = plainUrlRe.exec(content)) !== null) {
        results.push({ url: match[1] });
      }
    }

    return results;
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
