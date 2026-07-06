/**
 * Chart primitives for the emotions view, built with plain Views so they run
 * identically on web and native without a chart library.
 */

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  SentimentSummary,
  EMOTION_FAMILIES,
  EMOTION_EMOJI,
  familyScore,
} from '../../../model/Sentiment';
import { EmotionChartTheme } from './emotionTheme';

const CHART_HEIGHT = 96;

/**
 * Valence history: one diverging bar per analysed message, centered on a
 * zero baseline. Positive tones rise in blue, negative fall in red. Tapping
 * a bar reveals that message's excerpt and dominant emotion (the mobile
 * equivalent of a hover tooltip).
 */
export function ValenceHistoryChart({
  summary,
  theme,
}: {
  summary: SentimentSummary;
  theme: EmotionChartTheme;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const half = CHART_HEIGHT / 2;
  const selectedMessage =
    selected !== null
      ? summary.history.find((m) => m.index === selected)
      : null;

  return (
    <View>
      <View style={[styles.valenceChart, { height: CHART_HEIGHT }]}>
        {/* zero baseline */}
        <View
          style={[
            styles.zeroLine,
            { top: half - 1, backgroundColor: theme.baseline },
          ]}
        />
        {summary.history.map((m) => {
          const magnitude = Math.min(Math.abs(m.valence), 1) * (half - 4);
          const isPositive = m.valence >= 0;
          const isSelected = selected === m.index;
          return (
            <Pressable
              key={m.index}
              style={styles.valenceSlot}
              onPress={() =>
                setSelected(isSelected ? null : m.index)
              }
              accessibilityLabel={`Message ${m.index + 1}: valence ${m.valence.toFixed(2)}, ${m.topEmotion}`}
            >
              <View
                style={{
                  position: 'absolute',
                  left: '20%',
                  right: '20%',
                  height: Math.max(magnitude, 3),
                  ...(isPositive
                    ? {
                        bottom: half,
                        borderTopLeftRadius: 4,
                        borderTopRightRadius: 4,
                      }
                    : {
                        top: half,
                        borderBottomLeftRadius: 4,
                        borderBottomRightRadius: 4,
                      }),
                  backgroundColor: isPositive ? theme.positive : theme.negative,
                  opacity: selected === null || isSelected ? 1 : 0.35,
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={styles.axisRow}>
        <Text style={[styles.axisLabel, { color: theme.textMuted }]}>
          earlier
        </Text>
        <Text style={[styles.axisLabel, { color: theme.textMuted }]}>
          latest
        </Text>
      </View>
      {selectedMessage && (
        <View
          style={[
            styles.tooltip,
            { borderColor: theme.cardBorder, backgroundColor: theme.surface },
          ]}
        >
          <Text style={[styles.tooltipTitle, { color: theme.textPrimary }]}>
            {EMOTION_EMOJI[selectedMessage.topEmotion] ?? ''}{' '}
            {selectedMessage.topEmotion} ·{' '}
            {(selectedMessage.topScore * 100).toFixed(0)}% · valence{' '}
            {selectedMessage.valence.toFixed(2)}
          </Text>
          <Text
            style={[styles.tooltipExcerpt, { color: theme.textSecondary }]}
            numberOfLines={2}
          >
            “{selectedMessage.excerpt}”
          </Text>
        </View>
      )}
    </View>
  );
}

const FAMILY_META: {
  key: keyof typeof EMOTION_FAMILIES;
  label: string;
  color: (t: EmotionChartTheme) => string;
}[] = [
  { key: 'positive', label: 'Positive', color: (t) => t.familyPositive },
  { key: 'negative', label: 'Negative', color: (t) => t.familyNegative },
  { key: 'cognitive', label: 'Curious', color: (t) => t.familyCognitive },
  { key: 'neutral', label: 'Neutral', color: (t) => t.familyNeutral },
];

/**
 * Emotional mix: the 28 emotions folded into four families, shown as one
 * horizontal stacked bar (share of the total signal) with a labeled legend.
 */
export function EmotionFamilyBar({
  summary,
  theme,
}: {
  summary: SentimentSummary;
  theme: EmotionChartTheme;
}) {
  const scores = FAMILY_META.map((f) => ({
    ...f,
    score: familyScore(summary, f.key),
  }));
  const total = scores.reduce((sum, f) => sum + f.score, 0) || 1;

  return (
    <View>
      <View style={styles.stackedBar}>
        {scores.map((f, i) => (
          <View
            key={f.key}
            style={{
              flex: Math.max(f.score / total, 0.001),
              backgroundColor: f.color(theme),
              marginLeft: i === 0 ? 0 : 2,
              borderTopLeftRadius: i === 0 ? 4 : 0,
              borderBottomLeftRadius: i === 0 ? 4 : 0,
              borderTopRightRadius: i === scores.length - 1 ? 4 : 0,
              borderBottomRightRadius: i === scores.length - 1 ? 4 : 0,
            }}
          />
        ))}
      </View>
      <View style={styles.legendRow}>
        {scores.map((f) => (
          <View key={f.key} style={styles.legendItem}>
            <View
              style={[styles.legendDot, { backgroundColor: f.color(theme) }]}
            />
            <Text style={[styles.legendText, { color: theme.textSecondary }]}>
              {f.label} {((f.score / total) * 100).toFixed(0)}%
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * Horizontal magnitude bars for a list of emotions (single sequential hue,
 * direct labels — identity is carried by the label, not the color).
 */
export function EmotionBars({
  emotions,
  theme,
  maxScore,
}: {
  emotions: { emotion: string; score: number }[];
  theme: EmotionChartTheme;
  maxScore?: number;
}) {
  const max = maxScore ?? Math.max(...emotions.map((e) => e.score), 0.0001);
  return (
    <View>
      {emotions.map((e) => (
        <View key={e.emotion} style={styles.barRow}>
          <Text
            style={[styles.barLabel, { color: theme.textSecondary }]}
            numberOfLines={1}
          >
            {EMOTION_EMOJI[e.emotion] ?? ''} {e.emotion}
          </Text>
          <View
            style={[styles.barTrack, { backgroundColor: theme.sequentialTrack }]}
          >
            <View
              style={[
                styles.barFill,
                {
                  width: `${Math.max((e.score / max) * 100, 1.5)}%`,
                  backgroundColor: theme.sequential,
                },
              ]}
            />
          </View>
          <Text style={[styles.barValue, { color: theme.textPrimary }]}>
            {(e.score * 100).toFixed(0)}%
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  valenceChart: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  valenceSlot: {
    flex: 1,
    position: 'relative',
  },
  zeroLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    zIndex: 0,
  },
  axisRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  axisLabel: {
    fontSize: 11,
  },
  tooltip: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 8,
  },
  tooltipTitle: {
    fontSize: 13,
    fontWeight: '600',
  },
  tooltipExcerpt: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: 'italic',
  },
  stackedBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 4,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  legendText: {
    fontSize: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  barLabel: {
    width: 130,
    fontSize: 13,
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderTopRightRadius: 4,
    borderBottomRightRadius: 4,
  },
  barValue: {
    width: 44,
    textAlign: 'right',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
});
