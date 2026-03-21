import { StyleSheet } from "react-native";
import {
  neutral,
  pageBackground,
  pemAmber,
  textPrimary,
  textSecondary,
} from "@/constants/theme";
import {
  fontFamily,
  fontSize,
  lineHeight,
  radii,
  space,
} from "@/constants/typography";

function lh(size: number, ratio: number) {
  return Math.round(size * ratio);
}

export const text = StyleSheet.create({
  display: {
    fontFamily: fontFamily.display.bold,
    fontSize: fontSize.display,
    lineHeight: lh(fontSize.display, lineHeight.tight),
    color: textPrimary,
    letterSpacing: -0.6,
  },
  headline: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxxl,
    lineHeight: lh(fontSize.xxxl, lineHeight.snug),
    color: textPrimary,
    letterSpacing: -0.4,
  },
  title: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.normal),
    color: textPrimary,
  },
  titleLarge: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
    color: textPrimary,
  },
  body: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.relaxed),
    color: textPrimary,
  },
  bodyMuted: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.relaxed),
    color: textSecondary,
  },
  label: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.normal),
    color: textSecondary,
    letterSpacing: 0.15,
  },
  caption: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
    lineHeight: lh(fontSize.xs, lineHeight.normal),
    color: textSecondary,
  },
  /** Italic display accent — pair with brand amber for highlights */
  brandItalic: {
    fontFamily: fontFamily.display.italic,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.normal),
    color: pemAmber,
  },
  link: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.relaxed),
    color: pemAmber,
  },
});

export const layout = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: pageBackground,
  },
  screenPadded: {
    flex: 1,
    backgroundColor: pageBackground,
    paddingHorizontal: space[4],
    paddingVertical: space[4],
  },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: pageBackground,
  },
});

export const surfaces = StyleSheet.create({
  /** Elevated surface — warm white, not full-page cream */
  card: {
    backgroundColor: neutral.white,
    borderRadius: radii.md,
    padding: space[4],
  },
});

export const button = StyleSheet.create({
  primary: {
    backgroundColor: pemAmber,
    paddingVertical: space[3],
    paddingHorizontal: space[6],
    borderRadius: radii.md,
    minWidth: 200,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryPressed: {
    opacity: 0.88,
  },
  primaryLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.normal),
    color: neutral.white,
  },
});
