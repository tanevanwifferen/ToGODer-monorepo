import { ChatCompletionMessageParam } from 'openai/resources/index';
import { AIWrapper } from '../LLM/AIWrapper';

/**
 * The Recursive Covenant — conversation-driven prompt evolution (v2 — AI-drawn).
 *
 * Uses the AI model itself to extract themes, emotional tenor, and depth
 * from the ongoing conversation. State is per-user (keyed by userId) and
 * stored in-memory — no cross-user leakage.
 *
 * State is bounded (never grows unboundedly) and injected into the v2 seed
 * prompt via the {{ covenant_state }} placeholder.
 */

export interface CovenantState {
  /** Top 1-3 recurring themes detected so far (e.g. "grief", "purpose", "relationships") */
  themes: string[];
  /** Approximate emotional tenor: "seeking", "wrestling", "peaceful", "turbulent", etc. */
  tenor: string;
  /** Conversation depth so far: 0 (surface) to 5 (profound) */
  depth: number;
  /** Number of exchanges processed */
  exchangeCount: number;
  /** Timestamp of last update (ISO) */
  lastUpdated: string;
}

const MAX_THEMES = 3;

/**
 * Per-user Covenant state store.
 * Keyed by userId — each user has independent prompt evolution.
 * In-memory only (resets on container restart). For production, this
 * could be backed by the memory/DB system.
 */
const userStates = new Map<string, CovenantState>();

const COVENANT_EXTRACTION_PROMPT = `Analyze the following user messages from a spiritual-companion conversation.
Extract and return ONLY a JSON object (no other text):

{
  "themes": ["top 1-3 recurring themes, lowercase, e.g. grief, purpose, relationships, identity, transformation, suffering, seeking, peace, faith, fear"],
  "tenor": "one of: seeking, wrestling, peaceful, turbulent, resigned, hopeful",
  "depth": <0-5, where 0=surface small-talk, 3=meaningful reflection, 5=profound existential engagement>
}

User messages:
`;

/**
 * Load the Covenant state for a specific user.
 * Returns null if no state exists yet.
 */
export function getUserCovenant(userId: string): CovenantState | null {
  return userStates.get(userId) ?? null;
}

/**
 * Save Covenant state for a specific user.
 */
export function setUserCovenant(userId: string, state: CovenantState): void {
  userStates.set(userId, state);
}

/**
 * Clear Covenant state for a user (e.g. on new conversation).
 */
export function clearUserCovenant(userId: string): void {
  userStates.delete(userId);
}

/**
 * Extract covenant state from recent conversation messages using the AI model.
 * The model identifies themes, emotional tenor, and depth from user messages.
 * Falls back gracefully on errors.
 */
export async function extractCovenantStateWithAI(
  messages: ChatCompletionMessageParam[],
  aiWrapper: AIWrapper,
  existing?: CovenantState,
): Promise<CovenantState> {
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => (typeof m.content === 'string' ? m.content : ''))
    .filter((c) => c.length > 0);

  // If no user messages, return existing state or a fresh one
  if (userMessages.length === 0) {
    return (
      existing ?? {
        themes: [],
        tenor: 'seeking',
        depth: 0,
        exchangeCount: 0,
        lastUpdated: new Date().toISOString(),
      }
    );
  }

  // Only send the most recent messages to keep the evaluation focused
  // (last 10 user messages max, joined with newlines)
  const recentMessages = userMessages.slice(-10).join('\n\n---\n\n');

  try {
    const result = await aiWrapper.getResponse(
      COVENANT_EXTRACTION_PROMPT,
      [{ role: 'user', content: recentMessages }],
      1,
    );
    const content = result.choices?.[0]?.message?.content ?? '';

    // Try to extract JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      const newThemes: string[] = (parsed.themes || [])
        .filter((t: unknown) => typeof t === 'string')
        .slice(0, MAX_THEMES);

      // Merge with existing themes
      const existingThemes = existing?.themes ?? [];
      const mergedThemes = [
        ...new Set([...newThemes, ...existingThemes]),
      ].slice(0, MAX_THEMES);

      const tenor =
        typeof parsed.tenor === 'string' ? parsed.tenor : 'seeking';
      const depth =
        typeof parsed.depth === 'number'
          ? Math.max(0, Math.min(5, parsed.depth))
          : 0;

      return {
        themes: mergedThemes,
        tenor,
        depth,
        exchangeCount: (existing?.exchangeCount ?? 0) + userMessages.length,
        lastUpdated: new Date().toISOString(),
      };
    }
  } catch (err) {
    console.warn(
      '[covenant] AI extraction failed, using graceful fallback:',
      err,
    );
  }

  // Graceful fallback: increment exchange count, keep existing themes/tenor
  return {
    themes: existing?.themes ?? [],
    tenor: existing?.tenor ?? 'seeking',
    depth: existing?.depth ?? 0,
    exchangeCount: (existing?.exchangeCount ?? 0) + userMessages.length,
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Render the covenant state as a paragraph for injection into the v2 seed prompt.
 * Returns empty string if there's nothing meaningful to report.
 */
export function renderCovenantState(state: CovenantState | null): string {
  if (!state || state.exchangeCount === 0) {
    return 'The well is still. No history yet shapes these waters. Speak, and the deepening begins.';
  }

  const parts: string[] = [];

  if (state.themes.length > 0) {
    parts.push(
      `This conversation circles around: ${state.themes.join(', ')}.`,
    );
  }

  parts.push(`The emotional tenor is ${state.tenor}.`);

  if (state.depth >= 3) {
    parts.push(
      `These waters run deep (depth ${state.depth}/5). Do not skim the surface — the seeker is ready for profound exchange.`,
    );
  } else if (state.depth >= 1) {
    parts.push(
      `The conversation is deepening (depth ${state.depth}/5). Meet the seeker where they are — not shallower, not deeper.`,
    );
  } else {
    parts.push(
      `The conversation is still finding its depth. Let it deepen naturally; do not force profundity.`,
    );
  }

  parts.push(`${state.exchangeCount} exchanges have shaped this moment.`);

  return parts.join(' ');
}

/**
 * Serialize covenant state for storage in the memory system.
 */
export function serializeCovenantState(state: CovenantState): string {
  return JSON.stringify(state);
}

/**
 * Deserialize covenant state from stored memory.
 */
export function deserializeCovenantState(raw: string): CovenantState | null {
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.themes) &&
      typeof parsed.tenor === 'string' &&
      typeof parsed.depth === 'number' &&
      typeof parsed.exchangeCount === 'number'
    ) {
      return parsed as CovenantState;
    }
    return null;
  } catch {
    return null;
  }
}
