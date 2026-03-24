import { pemAmber, textPrimary, textSecondary } from "@/constants/theme";
import { fontFamily, fontSize, lh, lineHeight } from "@/constants/typography";
import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from "react-native";

export const textVariants = [
  "display",
  "headline",
  "title",
  "titleLarge",
  "body",
  "bodyMuted",
  "label",
  "caption",
  "brandItalic",
  "link",
] as const;

export type PemTextVariant = (typeof textVariants)[number];

const styles = StyleSheet.create({
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

export type PemTextProps = Omit<TextProps, "style"> & {
  variant?: PemTextVariant;
  style?: StyleProp<TextStyle>;
  children?: ReactNode;
};

export default function PemText({
  variant = "body",
  style,
  children,
  ...rest
}: PemTextProps) {
  return (
    <Text style={[styles[variant], style]} {...rest}>
      {children}
    </Text>
  );
}
