import { useMemo } from "react";

import { useTheme } from "@/contexts/ThemeContext";
import type { ThemeSemantic } from "@/contexts/ThemeContext";
import { amber } from "@/constants/theme";

/**
 * Inbox list chrome (header, rows, FAB) — derived from `ThemeContext` so light/dark match the rest of the app.
 * See `.cursor/rules/pem-ui-shell.mdc`.
 */
export type InboxShellColors = {
  bg: string;
  bgElevated: string;
  bgCard: string;
  border: string;
  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  amber: string;
  /** Muted amber surface (badges, pills) */
  amberMuted: string;
  /** Pressed FAB / darker amber */
  amberDim: string;
  /** Left rail while a prep is still prepping */
  amberStripMuted: string;
  /** Slightly lifted row when a prep is actively prepping */
  rowPreppingBg: string;
  /** Icon on solid amber FAB */
  fabIconOnAmber: string;
  success: string;
  warning: string;
  error: string;
};

export function inboxShellFromTheme(
  colors: ThemeSemantic,
  resolved: "light" | "dark",
): InboxShellColors {
  const a = colors.pemAmber;
  return {
    bg: colors.pageBackground,
    bgElevated: colors.secondarySurface,
    bgCard: colors.cardBackground,
    border: colors.borderMuted,
    textPrimary: colors.textPrimary,
    textSecondary: colors.textSecondary,
    textTertiary: colors.placeholder,
    amber: a,
    amberMuted: colors.brandMutedSurface,
    amberDim: resolved === "dark" ? amber[700] : amber[600],
    amberStripMuted: `${a}44`,
    rowPreppingBg: colors.surfacePage,
    fabIconOnAmber: resolved === "dark" ? "#141410" : "#1c1a16",
    success: "#22c55e",
    warning: "#f59e0b",
    error: colors.error,
  };
}

/** Hub inbox chrome — always follows user light/dark (and system) preference. */
export function useInboxShell(): InboxShellColors {
  const { colors, resolved } = useTheme();
  return useMemo(
    () => inboxShellFromTheme(colors, resolved),
    [colors, resolved],
  );
}
