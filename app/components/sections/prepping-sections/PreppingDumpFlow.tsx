import PemText from "@/components/ui/PemText";
import { PREPPING_FLOW_MAX_WIDTH } from "@/constants/layout";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { Check } from "lucide-react-native";
import { StyleSheet, View } from "react-native";
import PreppingParallelRows from "./PreppingParallelRows";

/** Acknowledgement → in-flight rows → short reassurance (CTA lives on screen footer). */
export default function PreppingDumpFlow() {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={[styles.iconBadge, { backgroundColor: colors.brandMutedSurface }]}>
          <Check size={36} stroke={colors.pemAmber} strokeWidth={2.5} />
        </View>
        <PemText style={[styles.headline, { color: colors.textPrimary }]}>Pem’s got it.</PemText>
        <PemText variant="body" style={[styles.sub, { color: colors.textSecondary }]}>
          Pem&apos;s on it — search, drafts, and options. Nothing&apos;s final until you open a prep.
        </PemText>
      </View>

      <View style={styles.listSection}>
        <PemText variant="bodyMuted" style={[styles.listLabel, { color: colors.textSecondary }]}>
          In flight
        </PemText>
        <PreppingParallelRows />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space[5],
    width: "100%",
    maxWidth: PREPPING_FLOW_MAX_WIDTH,
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
});
