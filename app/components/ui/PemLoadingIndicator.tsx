import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import {
  ActivityIndicator,
  type ActivityIndicatorProps,
  StyleSheet,
  View,
} from "react-native";

/**
 * Placement presets aligned with **What Pem knows** (profile facts): same amber, margins, and default size.
 *
 * - `listEmpty` / `listFooter` — match profile `FlatList` empty + pagination footer.
 * - `pageCenter` — full-screen centered load (prep detail, auth gate).
 * - `bare` — indicator only (optional `size`); use for compact rows.
 */
export type PemLoadingPlacement =
  | "listEmpty"
  | "listFooter"
  | "pageCenter"
  | "hubFooter"
  | "searchEmpty"
  | "headerInline"
  | "sheetCompact"
  | "inlineStart"
  | "overlayLarge"
  | "bare";

type Props = Omit<ActivityIndicatorProps, "color"> & {
  placement?: PemLoadingPlacement;
};

export default function PemLoadingIndicator({
  placement = "listEmpty",
  style,
  size,
  accessibilityLabel = "Loading",
  ...rest
}: Props) {
  const { colors } = useTheme();

  const resolvedSize =
    size ?? (placement === "overlayLarge" ? "large" : undefined);

  const indicator = (
    <ActivityIndicator
      accessibilityLabel={accessibilityLabel}
      color={colors.pemAmber}
      size={resolvedSize}
      style={style}
      {...rest}
    />
  );

  switch (placement) {
    case "bare":
      return indicator;
    case "listEmpty":
      return <View style={styles.listEmpty}>{indicator}</View>;
    case "listFooter":
      return <View style={styles.listFooter}>{indicator}</View>;
    case "pageCenter":
      return <View style={styles.pageCenter}>{indicator}</View>;
    case "hubFooter":
      return <View style={styles.hubFooter}>{indicator}</View>;
    case "searchEmpty":
      return <View style={styles.searchEmpty}>{indicator}</View>;
    case "headerInline":
      return <View style={styles.headerInline}>{indicator}</View>;
    case "sheetCompact":
      return <View style={styles.sheetCompact}>{indicator}</View>;
    case "inlineStart":
      return <View style={styles.inlineStart}>{indicator}</View>;
    case "overlayLarge":
      return indicator;
    default:
      return indicator;
  }
}

const styles = StyleSheet.create({
  listEmpty: {
    alignSelf: "center",
    marginTop: space[8],
  },
  listFooter: {
    alignSelf: "center",
    marginTop: space[4],
  },
  pageCenter: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: space[8],
    alignSelf: "stretch",
  },
  hubFooter: {
    marginVertical: space[4],
    alignItems: "center",
    alignSelf: "stretch",
  },
  searchEmpty: {
    marginVertical: space[6],
    alignItems: "center",
    alignSelf: "stretch",
  },
  headerInline: {
    alignItems: "center",
    paddingBottom: space[1],
    alignSelf: "stretch",
  },
  sheetCompact: {
    marginVertical: space[4],
    alignItems: "center",
    alignSelf: "stretch",
  },
  inlineStart: {
    alignSelf: "flex-start",
  },
});
