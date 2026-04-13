import { space } from "@/constants/typography";

/**
 * Primary UI width cap on tablet / web so layouts stay phone-sized and readable
 * instead of stretching edge-to-edge on wide viewports.
 */
export const MAX_APP_CONTENT_WIDTH = 640;

/** Settings / chrome — compact header row. */
export const TOP_ICON_CHIP = 36;
export const TOP_BAR_ROW_PAD = space[1];

export const glassChromeBorder = (resolved: "light" | "dark") =>
  resolved === "dark" ? "rgba(255, 255, 255, 0.18)" : "rgba(60, 60, 67, 0.18)";
