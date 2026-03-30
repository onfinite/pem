import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { Loader2 } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

/** Prepping tab with nothing in flight — intentional, not an error. */
export default function HomePreppingEmpty() {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.empty,
        {
          borderColor: colors.borderMuted,
          backgroundColor: colors.surfacePage,
        },
      ]}
    >
      <View style={[styles.emptyIconRing, { backgroundColor: colors.secondarySurface }]}>
        <Loader2 size={32} stroke={colors.textSecondary} strokeWidth={2} />
      </View>
      <PemText style={[styles.emptyTitle, { color: colors.textPrimary }]}>Nothing in flight</PemText>
      <PemText style={[styles.emptyBody, { color: colors.textSecondary }]}>
        After you dump, active work shows up here until it lands in Ready.
      </PemText>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    borderWidth: 1,
    borderRadius: radii.xl,
    padding: space[8],
    alignItems: "center",
    gap: space[4],
    marginTop: space[4],
  },
  emptyIconRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
    textAlign: "center",
  },
  emptyBody: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    textAlign: "center",
    maxWidth: 300,
  },
});
