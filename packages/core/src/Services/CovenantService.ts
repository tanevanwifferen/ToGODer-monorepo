import { ChatCompletionMessageParam } from 'openai/resources/index';

/**
 * The Recursive Covenant — conversation-driven prompt evolution.
 *
 * Extracts lightweight metadata from the ongoing conversation (themes,
 * emotional tenor, key topics) and stores it so the Seed Prompt can
 * reference it, varying its expression per conversation.
 *
 * State is bounded (never grows unboundedly) and stored in the existing
 * memory system under a reserved `__covenant__` key.
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
const THEME_KEYWORDS: Record<string, string[]> = {
  grief: ['loss', 'died', 'gone', 'grief', 'mourning', 'miss', 'funeral', 'passed away'],
  purpose: ['purpose', 'meaning', 'direction', 'calling', 'path', 'why am i', 'destiny'],
  relationships: ['relationship', 'partner', 'friend', 'family', 'love', 'connection', 'alone', 'lonely'],
  identity: ['who am i', 'identity', 'self', 'know myself', 'real me', 'authentic'],
  transformation: ['change', 'transform', 'grow', 'evolve', 'becoming', 'different', 'new me'],
  suffering: ['pain', 'suffering', 'struggle', 'hard', 'difficult', 'can\'t', 'overwhelmed'],
  seeking: ['seek', 'search', 'find', 'looking for', 'quest', 'explore', 'curious'],
  peace: ['peace', 'calm', 'quiet', 'still', 'rest', 'balance', 'harmony'],
  faith: ['god', 'faith', 'spiritual', 'divine', 'pray', 'soul', 'sacred', 'belief'],
  fear: ['fear', 'afraid', 'scared', 'anxious', 'worry', 'terror', 'dread'],
};

const TENOR_KEYWORDS: Record<string, string[]> = {
  seeking: ['how', 'what', 'why', 'wondering', 'curious', 'explore', 'tell me'],
  wrestling: ['but', 'however', 'struggle', 'conflict', 'can\'t', 'don\'t know', 'confused'],
  peaceful: ['grateful', 'thankful', 'peace', 'accept', 'okay', 'good', 'happy'],
  turbulent: ['angry', 'frustrated', 'upset', 'hurt', 'pain', 'cry', 'scream'],
  resigned: ['whatever', 'fine', 'doesn\'t matter', 'give up', 'tired', 'exhausted'],
  hopeful: ['hope', 'maybe', 'possible', 'dream', 'someday', 'believe', 'trust'],
};

/** Extract covenant state from recent conversation messages. */
export function extractCovenantState(
  messages: ChatCompletionMessageParam[],
  existing?: CovenantState,
): CovenantState {
  const userMessages = messages
    .filter((m) => m.role === 'user')
    .map((m) => (typeof m.content === 'string' ? m.content.toLowerCase() : ''));

  const allUserText = userMessages.join(' ');

  // ── Theme detection ──────────────────────────────────────────
  const themeScores = new Map<string, number>();
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      const matches = allUserText.match(regex);
      if (matches) score += matches.length;
    }
    if (score > 0) themeScores.set(theme, score);
  }

  const newThemes = [...themeScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_THEMES)
    .map(([t]) => t);

  // Merge with existing: keep previous themes that still show up, add new ones
  const existingThemes = existing?.themes ?? [];
  const mergedThemes = [...new Set([...newThemes, ...existingThemes])].slice(
    0,
    MAX_THEMES,
  );

  // ── Tenor detection ──────────────────────────────────────────
  const tenorScores = new Map<string, number>();
  for (const [tenor, keywords] of Object.entries(TENOR_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, 'gi');
      const matches = allUserText.match(regex);
      if (matches) score += matches.length;
    }
    if (score > 0) tenorScores.set(tenor, score);
  }

  const topTenor =
    [...tenorScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'seeking';

  // ── Depth estimation ─────────────────────────────────────────
  // Depth grows with: message count, use of abstract/questioning language
  const questionRatio =
    userMessages.filter((m) => m.includes('?')).length /
    Math.max(1, userMessages.length);
  const abstractTerms = [
    'meaning',
    'purpose',
    'soul',
    'god',
    'truth',
    'reality',
    'existence',
    'consciousness',
    'death',
    'life',
    'love',
    'fear',
  ];
  const abstractCount = abstractTerms.filter((t) =>
    allUserText.includes(t),
  ).length;

  let estimatedDepth = Math.min(
    5,
    Math.floor(
      (existing?.depth ?? 0) * 0.7 +
        userMessages.length * 0.1 +
        questionRatio * 2 +
        abstractCount * 0.2,
    ),
  );

  return {
    themes: mergedThemes,
    tenor: topTenor,
    depth: estimatedDepth,
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
