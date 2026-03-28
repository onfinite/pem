import { neutral, pemAmber, textPrimary } from "@/constants/theme";
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

export const pemButtonVariants = ["primary", "secondary", "ghost"] as const;
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

const variantDefs: Record<
  PemButtonVariant,
  {
    container: ViewStyle;
    pressed: ViewStyle;
    labelColor: string;
  }
> = {
  primary: {
    container: { backgroundColor: pemAmber },
    pressed: { opacity: 0.88 },
    labelColor: neutral.white,
  },
  secondary: {
    container: {
      backgroundColor: neutral.white,
      borderWidth: 1,
      borderColor: neutral[300],
    },
    pressed: { backgroundColor: neutral[100] },
    labelColor: textPrimary,
  },
  ghost: {
    container: { backgroundColor: "transparent" },
    pressed: { opacity: 0.65 },
    labelColor: pemAmber,
  },
};

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
};

export default function PemButton({
  onPress,
  children,
  variant = "primary",
  size = "md",
  style,
  textStyle,
}: PemButtonProps) {
  const def = variantDefs[variant];
  const sizeDef = sizeDefs[size];

  const content =
    typeof children === "string" || typeof children === "number" ? (
      <Text
        style={[
          styles.label,
          sizeDef.label,
          { color: def.labelColor },
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
      onPress={onPress}
      style={({ pressed }) => [
        styles.chrome,
        sizeDef.container,
        def.container,
        pressed && def.pressed,
        style,
      ]}
    >
      {content}
    </Pressable>
  );
}
