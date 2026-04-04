import { space } from "@/constants/typography";

/** Tab row min height (icons + labels), excluding vertical padding and safe inset. */
export const TAB_DOCK_INNER_MIN = 50;
/** Compact header chrome — maximize scroll area below. */
export const TOP_ICON_CHIP = 36;
export const TOP_BAR_ROW_PAD = space[1];

/** Hairline between chrome and scroll body — a touch stronger in light for separation. */
export const glassChromeBorder = (resolved: "light" | "dark") =>
  resolved === "dark" ? "rgba(255, 255, 255, 0.12)" : "rgba(28, 26, 22, 0.14)";

/** Segmented tab track tint — light needs slightly more weight on cream. */
export const segmentTrackTint = (resolved: "light" | "dark") =>
  resolved === "dark" ? "rgba(255, 255, 255, 0.07)" : "rgba(28, 26, 22, 0.09)";

/** Bottom inbox tab strip (padding + segment row, excluding home-indicator inset). */
export const INBOX_TAB_BAR_FIXED_HEIGHT = 86;
/** Space between FAB bottom edge and top of tab bar. */
export const INBOX_FAB_GAP_ABOVE_TAB = 8;
/** Matches `InboxDumpFab` diameter. */
export const INBOX_DUMP_FAB_SIZE = 52;
/**
 * Extra `FlatList` bottom padding so the last rows sit clearly above the bottom nav + FAB.
 * Gmail-style and Material guidance use ~8–16dp beyond the nav overlay so thumbs don’t hit list rows when aiming for tabs.
 */
export const INBOX_SCROLL_CLEARANCE_ABOVE_BOTTOM_NAV = space[4];
