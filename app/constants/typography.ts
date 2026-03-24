/**
 * Type scale + spacing. Font files are loaded via `pemFontSources` (see `constants/fonts.ts`).
 *
 * Default stack: DM Sans (UI/body) + Fraunces (headlines, italic brand accents).
 * Change fonts there and update `fontFamily` keys below to match `useFonts` map keys.
 */

/** Loaded font keys — must match `pemFontSources` */
export const fontFamily = {
  sans: {
    regular: "DMSans_400Regular",
    italic: "DMSans_400Regular_Italic",
    medium: "DMSans_500Medium",
    semibold: "DMSans_600SemiBold",
    bold: "DMSans_700Bold",
  },
  display: {
    italic: "Fraunces_400Regular_Italic",
    semibold: "Fraunces_600SemiBold",
    bold: "Fraunces_700Bold",
  },
} as const;

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  xxl: 28,
  xxxl: 34,
  display: 40,
} as const;

/** Multipliers → use with `Math.round(fontSize * ratio)` for RN `lineHeight` */
export const lineHeight = {
  tight: 1.12,
  snug: 1.22,
  normal: 1.35,
  relaxed: 1.45,
} as const;

/** Line height from font size × ratio (rounded). */
export function lh(size: number, ratio: number) {
  return Math.round(size * ratio);
}

/** 4px grid */
export const space = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  full: 9999,
} as const;
