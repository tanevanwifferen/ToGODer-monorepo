/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

// Chapel palette: warm amber/gold against deep stillness.
// Light is reserved for the threshold; dark is the interior.
const tintColorLight = '#b8860b';   // dark goldenrod — lantern flame
const tintColorDark = '#daa520';     // goldenrod — warmer glow
const primaryColorLight = '#1a1a2e'; // deep indigo
const primaryColorDark = '#e8d5a3';  // pale gold

export const Colors = {
  light: {
    text: '#1a1a1e',
    background: '#faf8f2',           // warm parchment
    tint: tintColorLight,
    primary: primaryColorLight,
    icon: '#8a7e6b',
    tabIconDefault: '#8a7e6b',
    tabIconSelected: tintColorLight,
    error: '#c44d34',                // muted rust
  },
  dark: {
    text: '#e8e0d0',                 // warm off-white
    background: '#0f0f14',           // deep stillness — not pure black
    tint: tintColorDark,
    primary: primaryColorDark,
    icon: '#7a7060',
    tabIconDefault: '#7a7060',
    tabIconSelected: tintColorDark,
    error: '#d4735a',                // soft rust
  },
};
