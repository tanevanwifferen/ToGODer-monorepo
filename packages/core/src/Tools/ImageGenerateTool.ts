import { ToolRegistry } from './ToolRegistry';
import {
  getOpenRouterClient,
  ImageGenResult,
  IMAGE_GEN_MODEL,
} from './OpenRouterClient';

/**
 * Register the `image_generate` backend tool.
 *
 * When the LLM calls image_generate, the handler sends the prompt to
 * OpenRouter's chat/completions with the gpt-image-2 model and parses
 * the response for image URLs or base64 data.
 *
 * The tool result is returned as a JSON structure that the chat UI can
 * recognise and render inline.
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
          'Returns one or more images as URLs or base64 data that can be rendered inline. ' +
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
        timeoutMs: Number(process.env.IMAGE_GEN_TIMEOUT_MS) || 60_000,
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

        const images = results.map((img: ImageGenResult, i: number) => ({
          url: img.url ?? null,
          base64: img.base64 ?? null,
          revisedPrompt: img.revisedPrompt ?? null,
          // Provide a ready-to-use markdown snippet so the model can inline
          // the image in its response without guessing the format.
          markdown: img.url
            ? `![Generated image ${i + 1}](${img.url})`
            : img.base64
              ? `![Generated image ${i + 1}](${img.base64})`
              : null,
        }));

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
