import axios from 'axios';
import { ToolRegistry } from './ToolRegistry';
import { ChatRequest } from '../Model/ChatRequest';

const TOOL_NAME = 'query_library';

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return ['true', '1', 'yes', 'y', 'on'].includes(normalized);
}

const LIBRARY_REQUEST_TIMEOUT_MS = 120000;
const LIBRARY_MAX_ATTEMPTS = 3;
const LIBRARY_RETRY_BASE_DELAY_MS = 1000;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Decide whether a failed library request is worth retrying. We retry on
 * transient conditions (timeouts, dropped connections, no response, or 5xx
 * server errors) but not on deterministic client errors (4xx) which would
 * just fail again.
 */
function isRetryableLibraryError(error: any): boolean {
  if (!axios.isAxiosError(error)) {
    return false;
  }
  const status = error.response?.status;
  if (status !== undefined) {
    return status >= 500;
  }
  // No response: timeout or network-level failure.
  return true;
}

/**
 * Register the query_library backend tool.
 *
 * Only registers when LIBRARY_INTEGRATION_ENABLED=true at startup.
 * Per-request, the tool is only included when the request also has
 * libraryIntegrationEnabled=true.
 */
export function registerLibraryTool(): void {
  const envEnabled = parseBooleanFlag(process.env.LIBRARY_INTEGRATION_ENABLED);
  if (!envEnabled) {
    return;
  }

  const registry = ToolRegistry.getInstance();

  registry.register(
    TOOL_NAME,
    {
      type: 'function',
      function: {
        name: TOOL_NAME,
        description:
          'Search the occult library for relevant book excerpts based on a query. ' +
          'Use this when the user asks about topics that might be covered in the library.',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'The search query to find relevant book excerpts',
            },
          },
          required: ['query'],
        },
      },
    },
    async (ctx) => {
      const query = ctx.arguments.query;
      if (typeof query !== 'string' || query.trim().length === 0) {
        return 'Error: query parameter is required and must be a non-empty string.';
      }

      const baseUrl = (process.env.LIBRARIAN_API_URL ?? '').trim();
      if (!baseUrl) {
        return 'Library service is not configured.';
      }

      const endpoint = `${baseUrl.replace(/\/$/, '')}/chat`;

      try {
        let response;
        let lastError: any;
        for (let attempt = 1; attempt <= LIBRARY_MAX_ATTEMPTS; attempt++) {
          try {
            response = await axios.post(
              endpoint,
              {
                messages: [{ role: 'user', content: query }],
              },
              {
                timeout: LIBRARY_REQUEST_TIMEOUT_MS,
              }
            );
            break;
          } catch (error: any) {
            lastError = error;
            if (attempt >= LIBRARY_MAX_ATTEMPTS || !isRetryableLibraryError(error)) {
              throw error;
            }
            const backoff = LIBRARY_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
            console.warn(
              `Library tool request failed (attempt ${attempt}/${LIBRARY_MAX_ATTEMPTS}), retrying in ${backoff}ms:`,
              error?.message ?? error
            );
            await delay(backoff);
          }
        }

        if (!response) {
          throw lastError ?? new Error('Library request failed with no response.');
        }

        const answer = response.data?.answer;
        if (typeof answer !== 'string' || answer.trim().length === 0) {
          return 'No relevant excerpts found for this query.';
        }

        let result = answer.trim();

        const sources = Array.isArray(response.data?.sources)
          ? response.data.sources
          : [];
        if (sources.length > 0) {
          const formattedSources = sources
            .map((src: any) => {
              const filename = src?.filename ?? 'unknown';
              const chunkIndex = src?.chunk_index;
              if (chunkIndex === undefined || chunkIndex === null) {
                return `- ${filename}`;
              }
              return `- ${filename}#${chunkIndex}`;
            })
            .join('\n');
          if (formattedSources.length > 0) {
            result += '\n\nSources:\n' + formattedSources;
          }
        }

        return result;
      } catch (error: any) {
        if (axios.isAxiosError(error)) {
          console.error('Library tool API error:', {
            message: error.message,
            status: error.response?.status,
            statusText: error.response?.statusText,
            code: error.code,
            endpoint,
          });
        } else {
          console.error('Library tool error:', error?.message ?? error);
        }
        return 'Failed to query the library. The service may be temporarily unavailable.';
      }
    },
    (request: ChatRequest) => !!request.libraryIntegrationEnabled
  );
}
