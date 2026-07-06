/**
 * Sentiment analysis types, mirroring the server's SentimentSummary
 * (packages/core/src/Services/SentimentService.ts). Produced by the
 * Go-Emotions sentiment service over the user's last 10 messages, billed to
 * the user's balance, and used for the emotions view + hidden AI context.
 */

export interface MessageSentiment {
  /** Index of the message within the analysed window (0 = oldest). */
  index: number;
  /** First characters of the message, for chart labelling. */
  excerpt: string;
  /** All 28 sigmoid scores keyed by emotion label. */
  predictions: Record<string, number>;
  topEmotion: string;
  topScore: number;
  /** Weighted pleasantness score in [-1, 1]. */
  valence: number;
}

export interface SentimentSummary {
  analyzedCount: number;
  windowSize: number;
  averages: Record<string, number>;
  topEmotions: { emotion: string; score: number }[];
  averageValence: number;
  valenceTrend: number;
  history: MessageSentiment[];
  billedUsd: number;
  model: string;
}

/**
 * The 28 Go Emotions labels grouped into families, so the view can tell a
 * readable story instead of dumping 28 numbers.
 */
export const EMOTION_FAMILIES: Record<
  'positive' | 'negative' | 'cognitive' | 'neutral',
  string[]
> = {
  positive: [
    'admiration',
    'amusement',
    'approval',
    'caring',
    'desire',
    'excitement',
    'gratitude',
    'joy',
    'love',
    'optimism',
    'pride',
    'relief',
  ],
  negative: [
    'anger',
    'annoyance',
    'disappointment',
    'disapproval',
    'disgust',
    'embarrassment',
    'fear',
    'grief',
    'nervousness',
    'remorse',
    'sadness',
  ],
  cognitive: ['confusion', 'curiosity', 'realization', 'surprise'],
  neutral: ['neutral'],
};

export const EMOTION_EMOJI: Record<string, string> = {
  admiration: '🤩',
  amusement: '😄',
  anger: '😠',
  annoyance: '😒',
  approval: '👍',
  caring: '🤗',
  confusion: '😕',
  curiosity: '🧐',
  desire: '😍',
  disappointment: '😞',
  disapproval: '👎',
  disgust: '🤢',
  embarrassment: '😳',
  excitement: '🤗',
  fear: '😨',
  gratitude: '🙏',
  grief: '😭',
  joy: '😊',
  love: '❤️',
  nervousness: '😬',
  optimism: '🌤️',
  pride: '🦁',
  realization: '💡',
  relief: '😮‍💨',
  remorse: '😔',
  sadness: '😢',
  surprise: '😮',
  neutral: '😐',
};

/** Mean score of an emotion family in a summary's averages. */
export function familyScore(
  summary: SentimentSummary,
  family: keyof typeof EMOTION_FAMILIES
): number {
  const labels = EMOTION_FAMILIES[family];
  const total = labels.reduce(
    (sum, label) => sum + (summary.averages[label] ?? 0),
    0
  );
  return total / labels.length;
}
