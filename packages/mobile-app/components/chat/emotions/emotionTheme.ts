/**
 * Chart palette for the emotions view — validated data-viz reference palette
 * (categorical slots, diverging blue↔red pair, chrome inks), stepped per
 * color scheme. Values are role-based so light/dark swap in one place.
 */

export interface EmotionChartTheme {
  surface: string;
  cardBorder: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  gridline: string;
  baseline: string;
  /** Diverging pair for valence (positive / negative). */
  positive: string;
  negative: string;
  /** Family colors. */
  familyPositive: string;
  familyNegative: string;
  familyCognitive: string;
  familyNeutral: string;
  /** Sequential hue for magnitude bars. */
  sequential: string;
  sequentialTrack: string;
}

const light: EmotionChartTheme = {
  surface: '#fcfcfb',
  cardBorder: 'rgba(11,11,11,0.10)',
  textPrimary: '#0b0b0b',
  textSecondary: '#52514e',
  textMuted: '#898781',
  gridline: '#e1e0d9',
  baseline: '#c3c2b7',
  positive: '#2a78d6',
  negative: '#e34948',
  familyPositive: '#1baf7a',
  familyNegative: '#e34948',
  familyCognitive: '#4a3aa7',
  familyNeutral: '#898781',
  sequential: '#2a78d6',
  sequentialTrack: '#f0efec',
};

const dark: EmotionChartTheme = {
  surface: '#1a1a19',
  cardBorder: 'rgba(255,255,255,0.10)',
  textPrimary: '#ffffff',
  textSecondary: '#c3c2b7',
  textMuted: '#898781',
  gridline: '#2c2c2a',
  baseline: '#383835',
  positive: '#3987e5',
  negative: '#e66767',
  familyPositive: '#199e70',
  familyNegative: '#e66767',
  familyCognitive: '#9085e9',
  familyNeutral: '#898781',
  sequential: '#3987e5',
  sequentialTrack: '#383835',
};

export function getEmotionChartTheme(
  scheme: 'light' | 'dark' | null | undefined
): EmotionChartTheme {
  return scheme === 'dark' ? dark : light;
}
