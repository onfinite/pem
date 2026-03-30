import { useTheme } from "@/contexts/ThemeContext";
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

const layout = StyleSheet.create({
  display: {
    fontFamily: fontFamily.display.bold,
    fontSize: fontSize.display,
    lineHeight: lh(fontSize.display, lineHeight.tight),
    letterSpacing: -0.6,
  },
  headline: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxxl,
    lineHeight: lh(fontSize.xxxl, lineHeight.snug),
    letterSpacing: -0.4,
  },
  title: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.normal),
  },
  titleLarge: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
  },
  body: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.relaxed),
  },
  bodyMuted: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.relaxed),
  },
  label: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.normal),
    letterSpacing: 0.15,
  },
  caption: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.xs,
    lineHeight: lh(fontSize.xs, lineHeight.normal),
  },
  brandItalic: {
    fontFamily: fontFamily.display.italic,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.normal),
  },
  link: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.base,
    lineHeight: lh(fontSize.base, lineHeight.relaxed),
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
  const { colors } = useTheme();

  const color =
    variant === "bodyMuted" || variant === "label" || variant === "caption"
      ? colors.textSecondary
      : variant === "brandItalic" || variant === "link"
        ? colors.pemAmber
        : colors.textPrimary;

  return (
    <Text style={[layout[variant], { color }, style]} {...rest}>
      {children}
    </Text>
  );
}
