import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { Check } from "lucide-react-native";
import { ScrollView, StyleSheet, Text, View } from "react-native";

type Props = { onBackToPreps: () => void; bottomInset: number };

export default function ReceivedScrollBody({ onBackToPreps, bottomInset }: Props) {
  const { colors } = useTheme();
  return (
    <ScrollView
      contentContainerStyle={[
        styles.scrollInner,
        { paddingBottom: Math.max(bottomInset, space[8]) },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={[styles.iconBadge, { backgroundColor: colors.brandMutedSurface }]}>
        <Check size={40} stroke={colors.pemAmber} strokeWidth={2.5} />
      </View>

      <PemText style={[styles.headline, { color: colors.textPrimary }]}>We got it.</PemText>
      <PemText variant="body" style={[styles.sub, { color: colors.textSecondary }]}>
        Pem is working on your dump in the background — searching, drafting, and lining up options where it helps.
      </PemText>

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollInner: {
    flexGrow: 1,
    paddingHorizontal: space[6],
    alignItems: "center",
    justifyContent: "center",
    gap: space[5],
    minHeight: 480,
  },
  iconBadge: {
    width: 96,
    height: 96,
    borderRadius: 48,
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
    maxWidth: 340,
  },
  reassure: {
    borderWidth: 1,
    borderRadius: 16,
    padding: space[5],
    gap: space[3],
    maxWidth: 400,
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
    marginTop: space[2],
    minWidth: 240,
  },
});
