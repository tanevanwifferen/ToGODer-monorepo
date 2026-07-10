import axios from "axios";

/**
 * Dynamic OpenRouter model discovery for document (PDF / file) input support.
 *
 * OpenRouter's public `GET /api/v1/models` endpoint returns each model's
 * `architecture.input_modalities`. A model can read documents/PDFs when that
 * array includes `"file"` (e.g. modality "text+image+file->text"). There is no
 * `file_uploads` supported_parameter; `input_modalities` is the signal.
 *
 * The list is fetched once and cached for a TTL (default 1h) so we do not hit
 * the API on every request. A single in-flight promise dedups concurrent
 * callers. Callers that only need a best-effort answer can use the
 * synchronous {@link cachedSupportsDocuments} helper.
 */

const OPENROUTER_MODELS_URL = "https://openrouter.ai/api/v1/models";
const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export interface OpenRouterModel {
  id: string;
  architecture?: {
    input_modalities?: string[];
    modality?: string;
  };
}

export interface OpenRouterModelsResponse {
  data: OpenRouterModel[];
}

interface CachedEntry {
  documentCapableSlugs: Set<string>;
  fetchedAt: number;
}

let cache: CachedEntry | null = null;
let inFlight: Promise<Set<string>> | null = null;
let cacheTtlMs = DEFAULT_CACHE_TTL_MS;

/**
 * Override the cache TTL (mainly for tests). Pass `null` to restore default.
 */
export function setCacheTtl(ms: number | null): void {
  cacheTtlMs = ms == null ? DEFAULT_CACHE_TTL_MS : ms;
}

/**
 * Clear the in-memory cache (mainly for tests).
 */
export function clearModelCache(): void {
  cache = null;
  inFlight = null;
}

/**
 * Fetch the set of OpenRouter model slugs that accept document/file input.
 * Cached for the configured TTL; concurrent callers share a single fetch.
 */
export async function fetchDocumentCapableModels(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < cacheTtlMs) {
    return cache.documentCapableSlugs;
  }
  if (inFlight) {
    return inFlight;
  }
  inFlight = (async () => {
    try {
      const res = await axios.get<OpenRouterModelsResponse>(
        OPENROUTER_MODELS_URL,
        { timeout: 10000 },
      );
      const slugs = new Set<string>();
      for (const m of res.data?.data ?? []) {
        const mods = m.architecture?.input_modalities;
        if (Array.isArray(mods) && mods.includes("file")) {
          slugs.add(m.id);
        }
      }
      cache = { documentCapableSlugs: slugs, fetchedAt: Date.now() };
      return slugs;
    } catch (err) {
      // On failure leave any existing cache in place so a transient
      // OpenRouter outage never empties the capability set; otherwise no
      // model is considered document-capable until the next successful fetch.
      if (cache) return cache.documentCapableSlugs;
      return new Set<string>();
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Synchronous best-effort check against the in-memory cache. Returns `null`
 * when the cache has not been populated yet (caller should fall back to the
 * async {@link fetchDocumentCapableModels}).
 */
export function cachedSupportsDocuments(slug: string): boolean | null {
  if (!cache) return null;
  return cache.documentCapableSlugs.has(slug);
}
