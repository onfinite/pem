import PemText from "@/components/ui/PemText";
import { PREPING_FLOW_MAX_WIDTH } from "@/constants/layout";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { Check } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import PrepingParallelRows from "./PrepingParallelRows";

/** Acknowledgement → in-flight rows → short reassurance (CTA lives on screen footer). */
export default function PrepingDumpFlow() {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={[styles.iconBadge, { backgroundColor: colors.brandMutedSurface }]}>
          <Check size={36} stroke={colors.pemAmber} strokeWidth={2.5} />
        </View>
        <PemText style={[styles.headline, { color: colors.textPrimary }]}>We got it.</PemText>
        <PemText variant="body" style={[styles.sub, { color: colors.textSecondary }]}>
          Searching, drafting, and lining up options. Nothing is final until you open a card.
        </PemText>
      </View>

      <View style={styles.listSection}>
        <PemText variant="bodyMuted" style={[styles.listLabel, { color: colors.textSecondary }]}>
          In progress
        </PemText>
        <PrepingParallelRows />
      </View>

      <View style={[styles.reassure, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
        <Text style={[styles.reassureLine, { color: colors.textPrimary }]}>
          Leave anytime — finished preps show up in{" "}
          <Text style={{ fontFamily: fontFamily.sans.semibold }}>Preps</Text>. Nothing sends without you.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space[5],
    width: "100%",
    maxWidth: PREPING_FLOW_MAX_WIDTH,
    alignSelf: "center",
    alignItems: "center",
  },
  hero: {
    gap: space[3],
    width: "100%",
    alignItems: "center",
  },
  iconBadge: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  headline: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxxl,
    lineHeight: lh(fontSize.xxxl, lineHeight.snug),
    textAlign: "center",
    letterSpacing: -0.4,
  },
  sub: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    textAlign: "center",
    maxWidth: 360,
    alignSelf: "center",
  },
  listSection: {
    gap: space[2],
    width: "100%",
    alignItems: "stretch",
  },
  listLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
    width: "100%",
  },
  reassure: {
    borderWidth: 1,
    borderRadius: 16,
    padding: space[4],
    width: "100%",
    alignSelf: "stretch",
  },
  reassureLine: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    textAlign: "center",
  },
});
