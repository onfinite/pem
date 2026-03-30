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
