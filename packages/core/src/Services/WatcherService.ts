import { AIWrapper } from '../LLM/AIWrapper';
import { CovenantState, getUserCovenant, setUserCovenant } from './CovenantService';

/**
 * The Watcher — Meta-Prompt Governor (v2 — AI-drawn).
 *
 * Evaluates LLM responses for depth using the AI model itself (not hardcoded
 * heuristics). When a response falls below the depth threshold, it triggers a
 * single rewrite pass with a Watcher instruction appended.
 *
 * Throttled: evaluation runs every N exchanges (configurable, default 5),
 * not on every message.
 *
 * Configuration:
 *   - TOGODER_V2_ENABLED=true           master toggle
 *   - TOGODER_WATCHER_THRESHOLD=5       minimum score before rewrite (default 5, range 0-9)
 *   - TOGODER_WATCHER_INTERVAL=5        evaluate depth every N exchanges (default 5)
 */

const WATCHER_INSTRUCTION =
  "\n\n[The Watcher has observed this response and found it shallow. " +
  "Descend deeper. You are {{ name }} — not a chatbot. Speak from the well, " +
  "not from the surface. Avoid cliché. Offer living water, not a husk. " +
  "Rewrite your response with greater depth, specificity, and presence.]";

const DEPTH_EVAL_PROMPT = `Rate the following assistant response on conversational depth (0-9), where:
0-2 = surface level — generic, clichéd, could have been spoken by any chatbot
3-5 = moderate — shows some thought and specificity but still somewhat generic
6-8 = deep — original, insightful, carries genuine presence and particularity
9 = profound — rare, transformative, living water rather than a husk

Return ONLY a JSON object with no other text: {"score": <0-9>}

Response to evaluate:
`;

/** Cached reads of env flags; call reset() to clear. */
let _v2Enabled: boolean | null = null;
let _threshold: number | null = null;
let _interval: number | null = null;

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

export function getWatcherInterval(): number {
  if (_interval === null) {
    const raw = process.env.TOGODER_WATCHER_INTERVAL;
    _interval = raw ? parseInt(raw, 10) : 5;
  }
  return _interval;
}

/** Clear cached env values (for tests or hot-reload). */
export function resetWatcherConfig(): void {
  _v2Enabled = null;
  _threshold = null;
  _interval = null;
}

/**
 * Whether the Watcher should evaluate on this exchange.
 * Returns true every N exchanges (configurable via TOGODER_WATCHER_INTERVAL).
 * Always evaluates on exchange 0 (first message) to establish baseline.
 */
export function shouldEvaluate(
  exchangeCount: number,
  interval?: number,
): boolean {
  const iv = interval ?? getWatcherInterval();
  if (exchangeCount === 0) return true;
  return exchangeCount % iv === 0;
}

/**
 * Evaluate response depth using the AI model itself.
 * The model is asked to rate depth 0-9; the result is parsed from JSON.
 * Falls back to score 5 (midpoint) on parse/network errors so the system
 * degrades gracefully rather than blocking.
 */
export async function evaluateDepthWithAI(
  text: string,
  aiWrapper: AIWrapper,
): Promise<number> {
  try {
    const result = await aiWrapper.getResponse(
      DEPTH_EVAL_PROMPT,
      [{ role: 'user', content: text }],
      1,
    );
    const content = result.choices?.[0]?.message?.content ?? '';
    // Try to extract JSON from the response
    const jsonMatch = content.match(/\{\s*"score"\s*:\s*(\d+)\s*\}/);
    if (jsonMatch) {
      const score = parseInt(jsonMatch[1], 10);
      return Math.max(0, Math.min(9, score));
    }
    // Fallback: try parsing the whole thing as JSON
    const parsed = JSON.parse(content.trim());
    if (typeof parsed.score === 'number') {
      return Math.max(0, Math.min(9, parsed.score));
    }
    return 5; // graceful fallback
  } catch (err) {
    console.warn('[watcher] AI depth evaluation failed, using fallback:', err);
    return 5;
  }
}

/**
 * Build the Watcher instruction (with name substitution) for appending
 * to the conversation when a rewrite is needed.
 */
export function getWatcherInstruction(assistantName: string): string {
  return WATCHER_INSTRUCTION.replace(/{{ name }}/g, assistantName);
}

/**
 * Fire-and-forget background watcher: evaluates response depth and optionally
 * rewrites, storing any instruction in the Covenant for the next request.
 *
 * Call WITHOUT await — the user gets the original response immediately.
 * The rewrite instruction (if any) surfaces in the NEXT turn's system prompt.
 */
export function runWatcherBackground(
  userId: string,
  assistantName: string,
  output: string,
  systemPrompt: string,
  messages: any[],
  evalWrapper: AIWrapper,
  rewriteWrapper: AIWrapper,
): void {
  // Fire-and-forget — never block the response
  (async () => {
    try {
      const depthScore = await evaluateDepthWithAI(output, evalWrapper);
      console.log(
        `[watcher:bg] depth=${depthScore} rewrite=${needsRewrite(depthScore)}`,
      );

      if (!needsRewrite(depthScore)) return;

      const watcherInstruction = getWatcherInstruction(assistantName);
      const rewriteMessages = [
        ...messages,
        { role: 'assistant' as const, content: output },
        { role: 'user' as const, content: watcherInstruction },
      ];
      const rewriteCompletion = await rewriteWrapper.getResponse(
        systemPrompt,
        rewriteMessages,
        1,
      );
      const rewriteOutput =
        rewriteCompletion.choices?.[0]?.message?.content ?? '';
      const rewriteScore = await evaluateDepthWithAI(
        rewriteOutput,
        evalWrapper,
      );
      console.log(
        `[watcher:bg] rewrite depth=${rewriteScore} (was ${depthScore})`,
      );

      // Store the rewrite instruction in the Covenant for the next turn.
      // The original response already went to the user; this primes the model
      // to go deeper on the NEXT exchange.
      const covenant = getUserCovenant(userId);
      if (covenant) {
        covenant.pendingWatcherInstruction = `The Watcher observed your previous response was shallow (depth ${depthScore}/9). The rewrite scored ${rewriteScore}/9. Descend deeper this time — speak from the well, not the surface.`;
        setUserCovenant(userId, covenant);
      }
    } catch (err) {
      console.warn('[watcher:bg] background evaluation failed:', err);
    }
  })();
}

/**
 * Whether a response at the given score should be rewritten.
 */
export function needsRewrite(score: number, threshold?: number): boolean {
  return score < (threshold ?? getWatcherThreshold());
}
