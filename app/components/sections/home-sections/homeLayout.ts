import { space } from "@/constants/typography";

/** Tab row min height (icons + labels), excluding vertical padding and safe inset. */
export const TAB_DOCK_INNER_MIN = 56;
/** Compact header chrome — maximize scroll area below. */
export const TOP_ICON_CHIP = 36;
export const TOP_BAR_ROW_PAD = space[1];

/** Small icon rings on the header strip (sit above the frosted bar). */
export const chipOnStrip = (resolved: "light" | "dark") =>
  resolved === "dark"
    ? "rgba(255, 255, 255, 0.1)"
    : "rgba(255, 255, 255, 0.55)";

/** ~80% opaque frosted strip so scrolling content reads through slightly. */
export const headerStripScrim = (resolved: "light" | "dark") =>
  resolved === "dark" ? "rgba(24, 22, 20, 0.8)" : "rgba(250, 248, 244, 0.8)";
