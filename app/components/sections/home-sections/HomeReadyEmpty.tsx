import { pemImpactLight } from "@/lib/pemHaptics";
import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import { router } from "expo-router";
import { Inbox } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

export default function HomeReadyEmpty() {
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
        <Inbox size={36} stroke={colors.textSecondary} strokeWidth={2} />
      </View>
      <PemText style={[styles.emptyTitle, { color: colors.textPrimary }]}>No preps yet</PemText>
      <PemText style={[styles.emptyBody, { color: colors.textSecondary }]}>
        Dump what&apos;s on your mind in text. Pem turns it into preps you open here.
      </PemText>
      <PemButton
        variant="primary"
        size="lg"
        onPress={() => {
          pemImpactLight();
          router.push("/dump");
        }}
      >
        Dump something
      </PemButton>
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
    width: 88,
    height: 88,
    borderRadius: 44,
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
    maxWidth: 320,
  },
});
