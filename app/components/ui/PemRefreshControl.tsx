import { useTheme } from "@/contexts/ThemeContext";
import { Platform, RefreshControl, type RefreshControlProps } from "react-native";

type Props = Omit<RefreshControlProps, "tintColor" | "colors" | "progressBackgroundColor">;

/**
 * Pull-to-refresh — theme-aware spinner: amber on light, warm light stroke on dark (readable on charcoal chrome).
 * Android: elevated surface behind the progress ring.
 */
export default function PemRefreshControl(props: Props) {
  const { colors, resolved } = useTheme();
  const spinnerColor =
    resolved === "dark" ? colors.textPrimary : colors.pemAmber;
  return (
    <RefreshControl
      {...props}
      tintColor={spinnerColor}
      colors={[spinnerColor]}
      progressBackgroundColor={
        Platform.OS === "android" ? colors.secondarySurface : undefined
      }
    />
  );
}
