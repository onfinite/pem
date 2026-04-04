import { useTheme } from "@/contexts/ThemeContext";
import {
  fontFamily,
  fontSize,
  lh,
  lineHeight,
  radii,
} from "@/constants/typography";
import type { ReactNode } from "react";
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  ViewStyle,
} from "react-native";

export const pemButtonVariants = [
  "primary",
  "secondary",
  "ghost",
  "destructive",
] as const;
export type PemButtonVariant = (typeof pemButtonVariants)[number];
export const pemButtonSizes = ["sm", "md", "lg"] as const;
export type PemButtonSize = (typeof pemButtonSizes)[number];

const styles = StyleSheet.create({
  chrome: {
    borderRadius: radii.md,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.normal),
  },
});

const sizeDefs: Record<
  PemButtonSize,
  { container: ViewStyle; label: TextStyle }
> = {
  sm: {
    container: { paddingHorizontal: 12, paddingVertical: 8 },
    label: {
      fontSize: fontSize.sm,
      lineHeight: lh(fontSize.sm, lineHeight.normal),
    },
  },
  md: {
    container: { paddingHorizontal: 20, paddingVertical: 12 },
    label: {
      fontSize: fontSize.md,
      lineHeight: lh(fontSize.md, lineHeight.normal),
    },
  },
  lg: {
    container: { paddingHorizontal: 28, paddingVertical: 16 },
    label: {
      fontSize: fontSize.lg,
      lineHeight: lh(fontSize.lg, lineHeight.normal),
    },
  },
};

type PemButtonProps = {
  onPress: () => void;
  children: ReactNode;
  variant?: PemButtonVariant;
  size?: PemButtonSize;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  disabled?: boolean;
};

export default function PemButton({
  onPress,
  children,
  variant = "primary",
  size = "md",
  style,
  textStyle,
  disabled = false,
}: PemButtonProps) {
  const { colors } = useTheme();
  const sizeDef = sizeDefs[size];

  const variantStyle: {
    container: ViewStyle;
    pressed: ViewStyle;
    labelColor: string;
  } =
    variant === "primary"
      ? {
          container: { backgroundColor: colors.pemAmber },
          pressed: { opacity: 0.88 },
          labelColor: colors.onPrimary,
        }
      : variant === "destructive"
        ? {
            container: { backgroundColor: colors.error },
            pressed: { opacity: 0.88 },
            labelColor: colors.onPrimary,
          }
        : variant === "secondary"
          ? {
              container: {
                backgroundColor: colors.secondarySurface,
                borderWidth: 1,
                borderColor: colors.border,
              },
              pressed: { opacity: 0.92 },
              labelColor: colors.textPrimary,
            }
          : {
              container: { backgroundColor: "transparent" },
              pressed: { opacity: 0.65 },
              labelColor: colors.pemAmber,
            };

  const content =
    typeof children === "string" || typeof children === "number" ? (
      <Text
        style={[
          styles.label,
          sizeDef.label,
          { color: variantStyle.labelColor },
          textStyle,
        ]}
      >
        {children}
      </Text>
    ) : (
      children
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.chrome,
        sizeDef.container,
        variantStyle.container,
        pressed && !disabled && variantStyle.pressed,
        disabled && { opacity: 0.45 },
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}
