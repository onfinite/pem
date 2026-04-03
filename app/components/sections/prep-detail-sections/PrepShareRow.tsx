import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { Send } from "lucide-react-native";
import { useCallback } from "react";
import { Platform, Pressable, Share, StyleSheet, View } from "react-native";

type Props = {
  text: string;
  /** Android share dialog title */
  shareTitle?: string;
  /** Default: labeled button; compact: icon-only for hub rows */
  variant?: "default" | "compact";
};

export default function PrepShareRow({
  text,
  shareTitle = "Prep",
  variant = "default",
}: Props) {
  const { colors } = useTheme();

  const onShare = useCallback(async () => {
    const t = text.trim();
    if (!t) return;
    try {
      await Share.share(
        Platform.OS === "android" ? { message: t, title: shareTitle } : { message: t },
      );
    } catch {
      /* dismissed */
    }
  }, [text, shareTitle]);

  if (!text.trim()) return null;

  const compact = variant === "compact";

  return (
    <View
      style={[
        styles.row,
        compact ? styles.rowCompact : styles.rowDefault,
        !compact && { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted },
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        onPress={() => void onShare()}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        style={({ pressed }) => [
          compact ? styles.iconBtn : styles.btn,
          !compact && { backgroundColor: colors.secondarySurface, opacity: pressed ? 0.88 : 1 },
          compact && { opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <Send size={18} stroke={colors.pemAmber} strokeWidth={2.25} />
        {!compact ? (
          <PemText style={[styles.label, { color: colors.textPrimary }]}>Send</PemText>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: space[2],
  },
  rowDefault: {
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: space[3],
    justifyContent: "flex-start",
  },
  rowCompact: {
    gap: space[1],
    justifyContent: "flex-end",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingVertical: space[2],
    paddingHorizontal: space[3],
    borderRadius: radii.md,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.sm,
  },
});
