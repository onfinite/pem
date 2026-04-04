import { useTheme } from "@/contexts/ThemeContext";
import { Platform, RefreshControl, type RefreshControlProps } from "react-native";

type Props = Omit<RefreshControlProps, "tintColor" | "colors" | "progressBackgroundColor">;

/**
 * Pull-to-refresh — theme-aware spinner: amber on light; **white** on dark (readable on black hub).
 * iOS: `tintColor`. Android: `colors` + `progressBackgroundColor` (Material ring; `tintColor` is ignored).
 */
export default function PemRefreshControl(props: Props) {
  const { colors, resolved } = useTheme();
  const dark = resolved === "dark";
  /** Hex ensures native refresh views get a solid light stroke on dark (textPrimary is white; explicit avoids edge cases). */
  const spinnerColor = dark ? "#ffffff" : colors.pemAmber;
  return (
    <RefreshControl
      {...props}
      tintColor={spinnerColor}
      colors={[spinnerColor]}
      progressBackgroundColor={
        Platform.OS === "android"
          ? dark
            ? colors.pageBackground
            : colors.secondarySurface
          : undefined
      }
    />
  );
}
