import { neutral, pemAmber, textPrimary } from "@/constants/theme";
import { fontFamily, fontSize, lh, lineHeight, radii } from "@/constants/typography";
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

const buttonChrome = {
  borderRadius: radii.md,
  alignItems: "center" as const,
  justifyContent: "center" as const,
};

const buttonLabel = {
  fontFamily: fontFamily.sans.semibold,
  fontSize: fontSize.md,
  lineHeight: lh(fontSize.md, lineHeight.normal),
};

const styles = StyleSheet.create({
  primary: {
    ...buttonChrome,
    backgroundColor: pemAmber,
  },
  primaryPressed: {
    opacity: 0.88,
  },
  primaryLabel: {
    ...buttonLabel,
    color: neutral.white,
  },

  secondary: {
    ...buttonChrome,
    backgroundColor: neutral.white,
    borderWidth: 1,
    borderColor: neutral[300],
  },
  secondaryPressed: {
    backgroundColor: neutral[100],
  },
  secondaryLabel: {
    ...buttonLabel,
    color: textPrimary,
  },

  ghost: {
    ...buttonChrome,
    backgroundColor: "transparent",
  },
  ghostPressed: {
    opacity: 0.65,
  },
  ghostLabel: {
    ...buttonLabel,
    color: pemAmber,
  },
});

type PemButtonProps = {
  onPress: () => void;
  children: ReactNode;
  variant?: PemButtonVariant;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

const variantConfig: Record<
  PemButtonVariant,
  {
    container: ViewStyle;
    pressed: ViewStyle | false;
    label: TextStyle;
  }
> = {
  primary: {
    container: styles.primary,
    pressed: styles.primaryPressed,
    label: styles.primaryLabel,
  },
  secondary: {
    container: styles.secondary,
    pressed: styles.secondaryPressed,
    label: styles.secondaryLabel,
  },
  ghost: {
    container: styles.ghost,
    pressed: styles.ghostPressed,
    label: styles.ghostLabel,
  },
};

export default function PemButton({
  onPress,
  children,
  variant = "primary",
  style,
  textStyle,
}: PemButtonProps) {
  const v = variantConfig[variant];

  const content =
    typeof children === "string" || typeof children === "number" ? (
      <Text style={[v.label, textStyle]}>{children}</Text>
    ) : (
      children
    );

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [v.container, pressed && v.pressed, style]}
    >
      {content}
    </Pressable>
  );
}
