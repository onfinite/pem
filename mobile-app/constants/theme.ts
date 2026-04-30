/**
 * Pem — warm amber + warm neutrals. Avoid cold grays; never pure white as page background.
 *
 * Usage:
 * - Pem amber (#e8763a): CTAs, links, active states, brand moments
 * - Text primary (#1c1a16): headlines, body, labels (not pure black)
 * - Text secondary (#6b6560): subheads, descriptions, card metadata
 * - Page background (#faf8f4): default surface; warm cream, not #fff
 */

/** Brand orange — same as amber.500 · rgb(232, 118, 58) */
export const pemAmber = "#e8763a" as const;

/** Amber ramp, light → dark. Brand primary is 500. */
export const amber = {
  50: "#fdf2ea",
  100: "#fce0c4",
  200: "#f9c89a",
  300: "#f4a870",
  400: "#ee8c4c",
  500: pemAmber,
  600: "#c45e22",
  700: "#9e4a16",
  800: "#78360e",
  900: "#522208",
} as const;

/** Warm neutral ramp, light → dark. Text primary = 700, secondary = 500. */
export const neutral = {
  /** Surfaces only — not for full-page background */
  white: "#ffffff",
  50: "#faf8f4",
  100: "#f4f1eb",
  150: "#ede9e1",
  200: "#e8e2d8",
  300: "#d8d0c4",
  400: "#b8b0a4",
  500: "#6b6560",
  600: "#3d3732",
  700: "#1c1a16",
} as const;

/** Done / success */
export const success = "#34c759" as const;
/** Working / pending */
export const pending = "#ff9500" as const;
/** Info / link */
export const info = "#007aff" as const;
/** Error / destructive */
export const error = "#ff453a" as const;

export const semantic = {
  success,
  pending,
  info,
  error,
} as const;

export const textPrimary = neutral[700];
export const textSecondary = neutral[500];
export const pageBackground = neutral[50];

/** Brand kit page surface (`pem-brand.html` — slightly cooler than cream) */
export const surfacePage = "#f7f5f1" as const;

/** Card / sheet on cream pages */
export const cardBackground = neutral.white;

export const colors = {
  pemAmber,
  primary: pemAmber,
  text: textPrimary,
  textSecondary,
  pageBackground,
  white: neutral.white,
  success,
  pending,
  info,
  error,
  amber,
  neutral,
} as const;

export type AmberShade = keyof typeof amber;
export type NeutralShade = keyof typeof neutral;
export type SemanticName = keyof typeof semantic;
export type ColorName = keyof typeof colors;
