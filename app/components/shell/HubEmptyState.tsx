import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import type { ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  /** Optional glyph — placed on a soft circular surface (no border). */
  icon?: ReactNode;
  title?: string;
  body?: string;
  children?: ReactNode;
  /** Slightly tighter vertical rhythm (e.g. archive tab). */
  compact?: boolean;
  /** Smaller icon well. */
  smallIconWell?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * Centered hub empty state — matches inbox shell: no card border, generous horizontal padding,
 * soft icon well only when an icon is provided.
 */
export default function HubEmptyState({
  icon,
  title,
  body,
  children,
  compact,
  smallIconWell,
  style,
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, compact && styles.wrapCompact, style]}>
      {icon ? (
        <View
          style={[
            styles.iconWell,
            smallIconWell && styles.iconWellSmall,
            { backgroundColor: colors.brandMutedSurface },
          ]}
        >
          {icon}
        </View>
      ) : null}
      {title ? (
        <PemText style={[styles.title, { color: colors.textPrimary }]}>{title}</PemText>
      ) : null}
      {body ? (
        <PemText style={[styles.body, { color: colors.textSecondary }]}>{body}</PemText>
      ) : null}
      {children ? <View style={styles.actions}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: "100%",
    alignItems: "center",
    paddingHorizontal: space[5],
    paddingVertical: space[8],
    gap: space[3],
  },
  wrapCompact: {
    paddingVertical: space[6],
    gap: space[2],
  },
  iconWell: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWellSmall: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
    textAlign: "center",
  },
  body: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    textAlign: "center",
    maxWidth: 320,
  },
  actions: {
    alignSelf: "stretch",
    maxWidth: 360,
    width: "100%",
    alignItems: "center",
  },
});
