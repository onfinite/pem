import PemButton from "@/components/ui/PemButton";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { MessageCircle } from "lucide-react-native";
import { StyleSheet, Text, View } from "react-native";

type Props = { onContinue: () => void };

export default function PrepingLeaveHint({ onContinue }: Props) {
  const { colors } = useTheme();
  return (
    <>
      <View style={[styles.banner, { backgroundColor: colors.brandMutedSurface, borderColor: colors.borderMuted }]}>
        <View style={[styles.bannerIcon, { backgroundColor: colors.cardBackground }]}>
          <MessageCircle size={22} stroke={colors.pemAmber} strokeWidth={2} />
        </View>
        <Text style={[styles.bannerText, { color: colors.textSecondary }]}>
          You&apos;re free to leave. We&apos;ll keep working — check Preps when you&apos;re ready.
        </Text>
      </View>

      <PemButton variant="primary" size="lg" onPress={onContinue} style={styles.cta}>
        Continue
      </PemButton>
    </>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    padding: space[4],
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  bannerIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  bannerText: {
    flex: 1,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    fontFamily: fontFamily.sans.regular,
  },
  cta: {
    marginTop: space[2],
  },
});
