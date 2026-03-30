import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { Check } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";
import PrepingParallelRows from "./PrepingParallelRows";

type Props = {
  onBackToPreps: () => void;
};

/** Single scroll: acknowledgement → in-flight preps → reassurance → CTA. */
export default function PrepingDumpFlow({ onBackToPreps }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.root}>
      <View style={[styles.hero, { alignItems: "center" }]}>
        <View style={[styles.iconBadge, { backgroundColor: colors.brandMutedSurface }]}>
          <Check size={36} stroke={colors.pemAmber} strokeWidth={2.5} />
        </View>
        <PemText style={[styles.headline, { color: colors.textPrimary }]}>We got it.</PemText>
        <PemText variant="body" style={[styles.sub, { color: colors.textSecondary }]}>
          Pem is working on your dump in the background — searching, drafting, and lining up options where it helps.
        </PemText>
      </View>

      <View style={styles.listSection}>
        <PemText style={[styles.listLead, { color: colors.textPrimary }]}>
          Pem is spinning up parallel work on each prep below. Nothing is final until you open your cards.
        </PemText>
        <PrepingParallelRows />
      </View>

      <View style={[styles.reassure, { backgroundColor: colors.cardBackground, borderColor: colors.borderMuted }]}>
        <Text style={[styles.reassureLine, { color: colors.textPrimary }]}>
          You don&apos;t need to stay on this screen. Come back to{" "}
          <Text style={{ fontFamily: fontFamily.sans.semibold }}>Preps</Text> when you&apos;re ready — your cards will
          be there.
        </Text>
        <PemText variant="bodyMuted" style={styles.reassureMuted}>
          Nothing sends, buys, or decides without you. Pem prepares; you act.
        </PemText>
      </View>

      <PemButton variant="primary" size="lg" onPress={onBackToPreps} style={styles.cta}>
        Back to Preps
      </PemButton>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: space[6],
    width: "100%",
  },
  hero: {
    gap: space[3],
    width: "100%",
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
    gap: space[3],
    width: "100%",
  },
  listLead: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
    maxWidth: 420,
  },
  reassure: {
    borderWidth: 1,
    borderRadius: 16,
    padding: space[5],
    gap: space[3],
    width: "100%",
  },
  reassureLine: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    textAlign: "center",
  },
  reassureMuted: {
    fontSize: fontSize.sm,
    lineHeight: lh(fontSize.sm, lineHeight.relaxed),
    textAlign: "center",
  },
  cta: {
    alignSelf: "center",
    minWidth: 240,
    marginTop: space[1],
  },
});
