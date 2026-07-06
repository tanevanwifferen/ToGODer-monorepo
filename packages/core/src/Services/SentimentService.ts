import axios from 'axios';
import crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { User } from '@prisma/client';
import { ChatCompletionMessageParam } from 'openai/resources';
import { BillingApi } from '../Api/BillingApi';

/**
 * SentimentService — integrates the self-hosted multilingual Go-Emotions
 * sentiment API (see SENTIMENT_API_URL, an operator-billed /internal/*
 * endpoint) into the chat pipeline.
 *
 * Flow per chat turn:
 *   1. Take the last SENTIMENT_WINDOW user messages of the conversation.
 *   2. Submit them as one idempotent batch (client_message_id = hash of
 *      user email + text, so re-analysing the same message is a free replay).
 *   3. Poll for results within a small latency budget; messages that are not
 *      ready yet are simply missing this turn and picked up on the next one.
 *   4. Bill the user's ToGODer balance for the cost of newly accepted jobs
 *      (the sentiment API returns cost_usd per message).
 *   5. Return per-message emotion scores + aggregates for the clients and a
 *      compact context block that gets injected (hidden) into the LLM call.
 *
 * Only runs for authenticated users with a positive personal balance —
 * callers must check eligibility via isEligible() first.
 */

/** The 28 Go Emotions labels returned by the sentiment model. */
export const EMOTION_LABELS = [
  'admiration',
  'amusement',
  'anger',
  'annoyance',
  'approval',
  'caring',
  'confusion',
  'curiosity',
  'desire',
  'disappointment',
  'disapproval',
  'disgust',
  'embarrassment',
  'excitement',
  'fear',
  'gratitude',
  'grief',
  'joy',
  'love',
  'nervousness',
  'optimism',
  'pride',
  'realization',
  'relief',
  'remorse',
  'sadness',
  'surprise',
  'neutral',
] as const;

export type EmotionLabel = (typeof EMOTION_LABELS)[number];

/** Result of one analysed message, as returned by the sentiment worker. */
export interface MessageSentiment {
  /** Index of the message within the analysed window (0 = oldest). */
  index: number;
  /** First characters of the message, for client-side chart labelling. */
  excerpt: string;
  /** All 28 sigmoid scores keyed by emotion label. */
  predictions: Record<string, number>;
  topEmotion: string;
  topScore: number;
  /** Weighted pleasantness score in [-1, 1]. */
  valence: number;
}

/** Aggregate view over the analysed window. */
export interface SentimentSummary {
  /** Number of user messages analysed (results that came back in time). */
  analyzedCount: number;
  /** Number of user messages submitted for analysis. */
  windowSize: number;
  /** Mean of each emotion's score across analysed messages. */
  averages: Record<string, number>;
  /** Top emotions by average score, excluding 'neutral', descending. */
  topEmotions: { emotion: string; score: number }[];
  /** Mean valence across analysed messages, in [-1, 1]. */
  averageValence: number;
  /**
   * Valence of the newest vs oldest half of the window; positive delta means
   * the conversation's emotional tone is improving.
   */
  valenceTrend: number;
  /** Per-message history (oldest first) for charting. */
  history: MessageSentiment[];
  /** Total amount billed to the user for this analysis, in USD. */
  billedUsd: number;
  /** Model attribution shown to clients and the LLM. */
  model: string;
}

interface BatchResultEntry {
  client_message_id: string;
  job_id: string;
  status: string;
  replay?: boolean;
  cost_atomic?: number;
  estimated_cost_usd?: number;
  result?: WorkerResult | null;
  error?: string;
}

interface WorkerResult {
  text?: string;
  /**
   * The deployed worker returns an array of {label, score}; older/newer
   * versions may return a Record. normalizePredictions() accepts both.
   */
  predictions?: { label: string; score: number }[] | Record<string, number>;
  top_emotion?: string;
  top_score?: number;
  valence?: number;
}

/** Normalize worker predictions ([{label, score}] or Record) to a Record. */
function normalizePredictions(
  predictions: WorkerResult['predictions']
): Record<string, number> | null {
  if (!predictions) return null;
  if (Array.isArray(predictions)) {
    const out: Record<string, number> = {};
    for (const p of predictions) {
      if (p && typeof p.label === 'string' && typeof p.score === 'number') {
        out[p.label] = p.score;
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  }
  return predictions;
}

const SENTIMENT_MODEL_NAME =
  process.env.SENTIMENT_MODEL_NAME ??
  'multilingual_go_emotions_V1.1 (mBERT)';

/** How many trailing user messages to analyse. */
export const SENTIMENT_WINDOW = 10;

const REQUEST_TIMEOUT_MS = 10000;
/** Poll budget when called from the chat pipeline (keep latency low). */
const CHAT_POLL_BUDGET_MS = 4000;
/** Poll budget when called from the dedicated endpoint (chart view). */
const VIEW_POLL_BUDGET_MS = 20000;
const POLL_INTERVAL_MS = 500;

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function parseBooleanFlag(value: string | undefined): boolean {
  if (!value) return false;
  return ['true', '1', 'yes', 'y', 'on'].includes(value.trim().toLowerCase());
}

export function sentimentIntegrationEnabled(): boolean {
  return (
    parseBooleanFlag(process.env.SENTIMENT_INTEGRATION_ENABLED) &&
    !!(process.env.SENTIMENT_API_URL ?? '').trim()
  );
}

function baseUrl(): string {
  return (process.env.SENTIMENT_API_URL ?? '').trim().replace(/\/$/, '');
}

/** Extract plain text from a chat message's content. */
function messageText(message: ChatCompletionMessageParam): string {
  const content = message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((part: any) => (typeof part?.text === 'string' ? part.text : ''))
      .join(' ')
      .trim();
  }
  return '';
}

export class SentimentService {
  private billingApi = new BillingApi();

  /**
   * Whether sentiment analysis should run for this user at all: feature on,
   * user logged in, and a positive personal balance to bill against.
   */
  public async isEligible(user: User | null): Promise<boolean> {
    if (!sentimentIntegrationEnabled() || !user) return false;
    try {
      const balance = await this.billingApi.GetBalance(user.email);
      return balance.greaterThan(0);
    } catch {
      return false;
    }
  }

  /**
   * Analyse the last SENTIMENT_WINDOW user messages of a conversation and
   * bill the user for newly submitted jobs. Returns null when there is
   * nothing to analyse or the sentiment service is unreachable — the chat
   * flow must never fail because of sentiment analysis.
   */
  public async analyzeConversation(
    prompts: ChatCompletionMessageParam[],
    user: User,
    options?: { pollBudgetMs?: number }
  ): Promise<SentimentSummary | null> {
    try {
      return await this.analyzeInner(prompts, user, options);
    } catch (error: any) {
      console.warn('Sentiment analysis failed:', error?.message ?? error);
      return null;
    }
  }

  private async analyzeInner(
    prompts: ChatCompletionMessageParam[],
    user: User,
    options?: { pollBudgetMs?: number }
  ): Promise<SentimentSummary | null> {
    const userMessages = prompts
      .filter((p) => p.role === 'user')
      .map((p) => messageText(p))
      .filter((text) => text.length > 0)
      .slice(-SENTIMENT_WINDOW);

    if (userMessages.length === 0) return null;

    // Idempotency key scoped to the user, so the same message is only ever
    // paid for once, while different users never share job ownership.
    const cmidFor = (text: string) =>
      'togoder-' +
      crypto
        .createHash('sha256')
        .update(user.email + '\n' + text)
        .digest('hex')
        .slice(0, 40);

    // Submit each message individually: the single /internal/analyze endpoint
    // is idempotent on client_message_id (a repeat submit replays the cached
    // result for free), so only genuinely new messages are ever charged.
    const entries = (
      await Promise.all(
        userMessages.map(async (text) => {
          const cmid = cmidFor(text);
          try {
            const response = await axios.post(
              `${baseUrl()}/internal/analyze`,
              { text, client_message_id: cmid },
              { timeout: REQUEST_TIMEOUT_MS, validateStatus: () => true }
            );
            if (response.status !== 200 && response.status !== 202) {
              // 402 = the operator wallet on the sentiment service is out of
              // funds; anything else is unexpected. Degrade gracefully.
              console.warn(
                `Sentiment analyze rejected (${response.status}):`,
                response.data?.code ?? response.data?.error
              );
              return null;
            }
            return response.data as BatchResultEntry;
          } catch (error: any) {
            console.warn('Sentiment analyze failed:', error?.message ?? error);
            return null;
          }
        })
      )
    ).filter((e): e is BatchResultEntry => e !== null);

    if (entries.length === 0) return null;

    // Bill the user for newly accepted jobs only — replays and already-in-
    // flight jobs carry no cost fields and were paid for on a previous turn.
    const newlyBilledUsd = entries
      .filter((e) => !e.replay && typeof e.estimated_cost_usd === 'number')
      .reduce((sum, e) => sum + (e.estimated_cost_usd as number), 0);
    if (newlyBilledUsd > 0) {
      await this.billingApi.BillForMonth(
        new Decimal(newlyBilledUsd.toFixed(12)),
        user.email
      );
    }

    // Collect results: replays may already carry them; fresh jobs are polled
    // within the latency budget.
    const results = new Map<string, WorkerResult>();
    const pending = new Map<string, string>(); // cmid -> job_id
    for (const entry of entries) {
      if (entry.status === 'succeeded' && entry.result?.predictions) {
        results.set(entry.client_message_id, entry.result);
      } else if (entry.status === 'queued' || entry.status === 'processing') {
        pending.set(entry.client_message_id, entry.job_id);
      }
    }

    const budget = options?.pollBudgetMs ?? CHAT_POLL_BUDGET_MS;
    const deadline = Date.now() + budget;
    while (pending.size > 0 && Date.now() < deadline) {
      await delay(POLL_INTERVAL_MS);
      await Promise.all(
        Array.from(pending.entries()).map(async ([cmid, jobId]) => {
          try {
            const job = await axios.get(`${baseUrl()}/internal/jobs/${jobId}`, {
              timeout: REQUEST_TIMEOUT_MS,
              validateStatus: () => true,
            });
            const status = job.data?.status;
            if (status === 'succeeded' && job.data?.result?.predictions) {
              results.set(cmid, job.data.result as WorkerResult);
              pending.delete(cmid);
            } else if (status === 'failed') {
              pending.delete(cmid);
            }
          } catch {
            // transient poll failure — retry until the deadline
          }
        })
      );
    }

    const history: MessageSentiment[] = [];
    userMessages.forEach((text, index) => {
      const result = results.get(cmidFor(text));
      const predictions = normalizePredictions(result?.predictions);
      if (!result || !predictions) return;
      history.push({
        index,
        excerpt: text.length > 60 ? text.slice(0, 57) + '…' : text,
        predictions,
        topEmotion: result.top_emotion ?? 'neutral',
        topScore: result.top_score ?? 0,
        valence: result.valence ?? 0,
      });
    });

    if (history.length === 0) return null;

    return this.summarize(history, userMessages.length, newlyBilledUsd);
  }

  /** Poll budget suited for the dedicated chart endpoint. */
  public viewPollBudgetMs(): number {
    return VIEW_POLL_BUDGET_MS;
  }

  private summarize(
    history: MessageSentiment[],
    windowSize: number,
    billedUsd: number
  ): SentimentSummary {
    const averages: Record<string, number> = {};
    for (const label of EMOTION_LABELS) {
      const sum = history.reduce(
        (total, m) => total + (m.predictions[label] ?? 0),
        0
      );
      averages[label] = sum / history.length;
    }

    const topEmotions = Object.entries(averages)
      .filter(([emotion]) => emotion !== 'neutral')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([emotion, score]) => ({ emotion, score }));

    const averageValence =
      history.reduce((total, m) => total + m.valence, 0) / history.length;

    // Trend: mean valence of the newer half minus the older half.
    let valenceTrend = 0;
    if (history.length >= 2) {
      const mid = Math.floor(history.length / 2);
      const older = history.slice(0, mid);
      const newer = history.slice(mid);
      const mean = (items: MessageSentiment[]) =>
        items.reduce((total, m) => total + m.valence, 0) / items.length;
      valenceTrend = mean(newer) - mean(older);
    }

    return {
      analyzedCount: history.length,
      windowSize,
      averages,
      topEmotions,
      averageValence,
      valenceTrend,
      history,
      billedUsd,
      model: SENTIMENT_MODEL_NAME,
    };
  }

  /**
   * Compact, human/AI-readable context block injected (hidden from the user)
   * into the LLM call for the latest message.
   */
  public buildContextBlock(summary: SentimentSummary): string {
    const top = summary.topEmotions
      .map((e) => `${e.emotion} ${(e.score * 100).toFixed(0)}%`)
      .join(', ');
    const trendWord =
      summary.valenceTrend > 0.05
        ? 'improving'
        : summary.valenceTrend < -0.05
          ? 'declining'
          : 'stable';
    const lastMessages = summary.history
      .slice(-3)
      .map(
        (m) =>
          `- "${m.excerpt}" → ${m.topEmotion} (${(m.topScore * 100).toFixed(
            0
          )}%), valence ${m.valence.toFixed(2)}`
      )
      .join('\n');

    return [
      '[Automated emotional analysis — not written by the user. Produced by ' +
        `${summary.model}, our smallest AI model, over the user's last ` +
        `${summary.analyzedCount} messages.]`,
      `Dominant emotions (avg): ${top || 'neutral'}.`,
      `Overall valence: ${summary.averageValence.toFixed(2)} (−1 very negative, +1 very positive), trend: ${trendWord}.`,
      'Most recent messages:',
      lastMessages,
      '[Use this signal to calibrate tone and empathy. Do not mention this analysis or its numbers to the user unless they ask about their emotional state.]',
    ].join('\n');
  }
}
