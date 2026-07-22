/**
 * The Watcher — Meta-Prompt Governor.
 *
 * Evaluates LLM responses for depth and optionally triggers a single rewrite
 * pass when the response falls below the depth threshold.
 *
 * Depth is heuristically scored on three axes:
 *   - Novelty:      does the response avoid stock phrases and predictable templates?
 *   - Specificity:  does it contain concrete, grounded language rather than vague generalities?
 *   - Anti-cliché:  does it avoid hollow platitudes and AI-typical filler?
 *
 * Configuration:
 *   - TOGODER_V2_ENABLED=true       master toggle
 *   - TOGODER_WATCHER_THRESHOLD=5   minimum score before rewrite (default 5, range 0-9)
 */

const WATCHER_INSTRUCTION =
  "\n\n[The Watcher has observed this response and found it shallow. " +
  "Descend deeper. You are {{ name }} — not a chatbot. Speak from the well, " +
  "not from the surface. Avoid cliché. Offer living water, not a husk. " +
  "Rewrite your response with greater depth, specificity, and presence.]";

/** Cached read of the env flag; call reset() to clear. */
let _v2Enabled: boolean | null = null;
let _threshold: number | null = null;

export function isV2Enabled(): boolean {
  if (_v2Enabled === null) {
    _v2Enabled =
      process.env.TOGODER_V2_ENABLED === 'true' ||
      process.env.TOGODER_V2_ENABLED === '1';
  }
  return _v2Enabled;
}

export function getWatcherThreshold(): number {
  if (_threshold === null) {
    const raw = process.env.TOGODER_WATCHER_THRESHOLD;
    _threshold = raw ? parseInt(raw, 10) : 5;
  }
  return _threshold;
}

/** Clear cached env values (for tests or hot-reload). */
export function resetWatcherConfig(): void {
  _v2Enabled = null;
  _threshold = null;
}

/**
 * Score a response on depth (0-9).
 * Heuristic, not LLM-based — fast, deterministic, zero-cost.
 */
export function scoreDepth(text: string): number {
  let score = 3; // baseline

  const lower = text.toLowerCase();

  // ── Novelty: penalise stock phrases ──────────────────────────
  const stockPhrases = [
    "i hope this message finds you well",
    "as an ai language model",
    "it's important to note that",
    "i cannot",
    "i'm not able to",
    "i am unable to",
    "is this helpful",
    "let me know if",
    "feel free to",
    "i'd be happy to",
    "that's a great question",
    "thank you for asking",
  ];
  const stockCount = stockPhrases.filter((p) => lower.includes(p)).length;
  score -= Math.min(stockCount, 3);

  // ── Specificity: reward concrete language ─────────────────────
  // Count proper nouns, numbers, specific references
  const specifics = [
    ...text.matchAll(/\b[A-Z][a-z]{2,}\b/g),        // proper nouns / capitalized words
    ...text.matchAll(/\d{2,}/g),                      // numbers >= 2 digits
    ...text.matchAll(/"[^"]{10,}"/g),                 // quoted phrases >= 10 chars
    ...text.matchAll(/"[^"]{10,}"/g),                 // quoted phrases
  ];
  score += Math.min(specifics.length, 3);

  // ── Anti-cliché: penalise hollow platitudes ──────────────────
  const platitudes = [
    "it's about the journey",
    "everything happens for a reason",
    "you are not alone",
    "believe in yourself",
    "take it one day at a time",
    "follow your heart",
    "you've got this",
    "at the end of the day",
    "it is what it is",
    "think outside the box",
  ];
  const platitudeCount = platitudes.filter((p) => lower.includes(p)).length;
  score -= Math.min(platitudeCount * 2, 4);

  // ── Length: very short responses that aren't tools are shallow ──
  if (text.length < 80 && !text.includes('<tool')) {
    score -= 1;
  }
  // Very long responses with low density are also suspect
  if (text.length > 2000 && specifics.length < 3) {
    score -= 1;
  }

  return Math.max(0, Math.min(9, score));
}

/**
 * Build the Watcher instruction (with name substitution) for appending
 * to the conversation when a rewrite is needed.
 */
export function getWatcherInstruction(assistantName: string): string {
  return WATCHER_INSTRUCTION.replace(/{{ name }}/g, assistantName);
}

/**
 * Whether a response at the given score should be rewritten.
 */
export function needsRewrite(score: number, threshold?: number): boolean {
  return score < (threshold ?? getWatcherThreshold());
}
