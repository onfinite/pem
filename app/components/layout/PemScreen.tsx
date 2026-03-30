import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import type { ReactNode } from "react";
import { View, type StyleProp, type ViewProps, type ViewStyle } from "react-native";

export type PemScreenVariant = "screen" | "padded" | "center";

type PemScreenProps = Omit<ViewProps, "style"> & {
  variant?: PemScreenVariant;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/** Full-screen shell with theme background — pairs with `ScreenScroll` for scrollable flows. */
export default function PemScreen({
  variant = "screen",
  style,
  children,
  ...rest
}: PemScreenProps) {
  const { colors } = useTheme();

  const base: ViewStyle =
    variant === "padded"
      ? {
          flex: 1,
          backgroundColor: colors.pageBackground,
          paddingHorizontal: space[4],
          paddingVertical: space[4],
        }
      : variant === "center"
        ? {
            flex: 1,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: colors.pageBackground,
          }
        : { flex: 1, backgroundColor: colors.pageBackground };

  return (
    <View style={[base, style]} {...rest}>
      {children}
    </View>
  );
}
