/**
 * Emotions view: a small mood chip for the chat header plus the full
 * "Emotional pulse" panel. Shows the average of the 28 Go-Emotions scores
 * over the user's last 10 messages, their valence journey, and the emotional
 * mix — analysis is billed to the user's balance, so both components render
 * nothing unless the user is logged in and has credit.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
  ActivityIndicator,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useAuth } from '../../../hooks/useAuth';
import { selectBalance } from '../../../redux/slices/balanceSlice';
import { selectSentimentEnabled } from '../../../redux/slices/globalConfigSlice';
import {
  selectSentimentForChat,
  setSentiment,
} from '../../../redux/slices/sentimentSlice';
import { SentimentApiClient } from '../../../apiClients/SentimentApiClient';
import { ApiChatMessage } from '../../../model/ChatRequest';
import { EMOTION_EMOJI, SentimentSummary } from '../../../model/Sentiment';
import { getEmotionChartTheme } from './emotionTheme';
import {
  EmotionBars,
  EmotionFamilyBar,
  ValenceHistoryChart,
} from './EmotionCharts';

function useEmotionsEligible(): boolean {
  const { isAuthenticated } = useAuth();
  const balance = useSelector(selectBalance);
  const featureEnabled = useSelector(selectSentimentEnabled);
  // Optional feature: hidden entirely unless the server has the sentiment
  // service configured. The analysis is billed to the user's own credit, so
  // the view is also hidden for logged-out users and users without a
  // positive personal balance.
  return featureEnabled && isAuthenticated && balance.balance > 0;
}

function trendGlyph(summary: SentimentSummary): string {
  if (summary.valenceTrend > 0.05) return '↗';
  if (summary.valenceTrend < -0.05) return '↘';
  return '→';
}

/**
 * Compact mood chip for the chat header: dominant emotion emoji + trend.
 * Renders nothing when ineligible or when no analysis exists yet.
 */
export function MoodChip({
  chatId,
  hasMessages,
  onPress,
}: {
  chatId: string;
  hasMessages: boolean;
  onPress: () => void;
}) {
  const eligible = useEmotionsEligible();
  const summary = useSelector(selectSentimentForChat(chatId));
  const scheme = useColorScheme();
  const theme = getEmotionChartTheme(scheme);

  // Billed feature: hidden entirely when logged out or without credit.
  if (!eligible || (!summary && !hasMessages)) return null;
  const dominant = summary?.topEmotions[0]?.emotion;

  return (
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: theme.cardBorder, backgroundColor: theme.surface },
      ]}
      accessibilityLabel={
        dominant && summary
          ? `Emotional pulse: mostly ${dominant}, trend ${trendGlyph(summary)}`
          : 'Open emotional pulse'
      }
    >
      <Text style={styles.chipEmoji}>
        {dominant ? (EMOTION_EMOJI[dominant] ?? '😐') : '✨'}
      </Text>
      {summary && (
        <Text style={[styles.chipTrend, { color: theme.textSecondary }]}>
          {trendGlyph(summary)}
        </Text>
      )}
    </TouchableOpacity>
  );
}

/**
 * Full-screen modal with the emotion analysis of the conversation.
 * If no analysis is in the store yet, one is requested (billed; replays of
 * already-analysed messages are free server-side).
 */
export function EmotionsPanel({
  chatId,
  messages,
  visible,
  onClose,
}: {
  chatId: string;
  messages: ApiChatMessage[];
  visible: boolean;
  onClose: () => void;
}) {
  const eligible = useEmotionsEligible();
  const summary = useSelector(selectSentimentForChat(chatId));
  const dispatch = useDispatch();
  const scheme = useColorScheme();
  const theme = getEmotionChartTheme(scheme);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await SentimentApiClient.analyze(messages);
      if (result) {
        dispatch(setSentiment({ chatId, sentiment: result }));
      } else {
        setError('No analysis available yet — try again in a moment.');
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Failed to analyze the conversation.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [chatId, messages, dispatch]);

  // Fetch on first open when there is nothing to show yet.
  React.useEffect(() => {
    if (visible && eligible && !summary && !isLoading && !error) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, eligible, summary]);

  const allEmotions = useMemo(() => {
    if (!summary) return [];
    return Object.entries(summary.averages)
      .map(([emotion, score]) => ({ emotion, score }))
      .sort((a, b) => b.score - a.score);
  }, [summary]);

  if (!eligible) return null;

  const moodScore = summary ? ((summary.averageValence + 1) / 2) * 10 : 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.surface, borderColor: theme.cardBorder },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.title, { color: theme.textPrimary }]}>
              Emotional pulse
            </Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={[styles.closeText, { color: theme.textSecondary }]}>
                ✕
              </Text>
            </TouchableOpacity>
          </View>

          {isLoading && !summary && (
            <View style={styles.loadingBox}>
              <ActivityIndicator />
              <Text style={[styles.loadingText, { color: theme.textMuted }]}>
                Reading the room…
              </Text>
            </View>
          )}

          {error && !summary && (
            <View style={styles.loadingBox}>
              <Text style={[styles.loadingText, { color: theme.textMuted }]}>
                {error}
              </Text>
              <TouchableOpacity onPress={refresh}>
                <Text style={[styles.retryText, { color: theme.sequential }]}>
                  Try again
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {summary && (
            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
            >
              {/* Stat tiles */}
              <View style={styles.tileRow}>
                <View
                  style={[styles.tile, { borderColor: theme.cardBorder }]}
                >
                  <Text style={[styles.tileLabel, { color: theme.textMuted }]}>
                    Mood
                  </Text>
                  <Text
                    style={[styles.tileValue, { color: theme.textPrimary }]}
                  >
                    {moodScore.toFixed(1)}
                    <Text style={[styles.tileUnit, { color: theme.textMuted }]}>
                      /10
                    </Text>
                  </Text>
                  <Text
                    style={[
                      styles.tileDelta,
                      {
                        color:
                          summary.valenceTrend >= 0
                            ? theme.familyPositive
                            : theme.negative,
                      },
                    ]}
                  >
                    {trendGlyph(summary)}{' '}
                    {summary.valenceTrend >= 0 ? 'lifting' : 'sinking'}
                  </Text>
                </View>
                <View
                  style={[styles.tile, { borderColor: theme.cardBorder }]}
                >
                  <Text style={[styles.tileLabel, { color: theme.textMuted }]}>
                    Mostly
                  </Text>
                  <Text
                    style={[styles.tileValue, { color: theme.textPrimary }]}
                    numberOfLines={1}
                  >
                    {EMOTION_EMOJI[summary.topEmotions[0]?.emotion] ?? ''}{' '}
                    {summary.topEmotions[0]?.emotion ?? 'neutral'}
                  </Text>
                  <Text style={[styles.tileDelta, { color: theme.textMuted }]}>
                    {((summary.topEmotions[0]?.score ?? 0) * 100).toFixed(0)}%
                    avg
                  </Text>
                </View>
              </View>

              {/* Valence journey */}
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Valence journey
              </Text>
              <Text
                style={[styles.sectionCaption, { color: theme.textMuted }]}
              >
                Tone of each of your last {summary.analyzedCount} messages —
                tap a bar for details
              </Text>
              <ValenceHistoryChart summary={summary} theme={theme} />

              {/* Emotional mix */}
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Emotional mix
              </Text>
              <EmotionFamilyBar summary={summary} theme={theme} />

              {/* Top emotions */}
              <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
                Strongest signals
              </Text>
              <EmotionBars emotions={summary.topEmotions} theme={theme} />

              <TouchableOpacity onPress={() => setShowAll(!showAll)}>
                <Text style={[styles.toggleAll, { color: theme.sequential }]}>
                  {showAll ? 'Hide' : 'Show'} all 28 emotions
                </Text>
              </TouchableOpacity>
              {showAll && (
                <EmotionBars
                  emotions={allEmotions}
                  theme={theme}
                  maxScore={Math.max(allEmotions[0]?.score ?? 0, 0.0001)}
                />
              )}

              {/* Attribution / billing footnote */}
              <Text style={[styles.footnote, { color: theme.textMuted }]}>
                Analyzed {summary.analyzedCount} of your last{' '}
                {summary.windowSize} messages with {summary.model} — the
                smallest AI we run. Billed to your balance
                {summary.billedUsd > 0
                  ? ` ($${summary.billedUsd.toFixed(6)})`
                  : ' (already analyzed — free)'}
                .
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 8,
  },
  chipEmoji: {
    fontSize: 14,
  },
  chipTrend: {
    fontSize: 12,
    marginLeft: 3,
    fontWeight: '600',
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    maxHeight: '88%',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderWidth: 1,
    padding: 20,
    zIndex: 1,
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    padding: 6,
  },
  closeText: {
    fontSize: 16,
  },
  scroll: {
    flexGrow: 0,
  },
  loadingBox: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 4,
  },
  tileRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
  },
  tile: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
  },
  tileLabel: {
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tileValue: {
    fontSize: 22,
    fontWeight: '700',
    marginTop: 2,
  },
  tileUnit: {
    fontSize: 13,
    fontWeight: '400',
  },
  tileDelta: {
    fontSize: 12,
    marginTop: 2,
    fontWeight: '600',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 20,
    marginBottom: 6,
  },
  sectionCaption: {
    fontSize: 12,
    marginBottom: 8,
  },
  toggleAll: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
  },
  footnote: {
    fontSize: 11,
    marginTop: 18,
    marginBottom: 8,
    lineHeight: 15,
  },
});
