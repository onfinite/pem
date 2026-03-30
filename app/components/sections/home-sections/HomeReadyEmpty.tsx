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
    <View style={[styles.empty, { borderColor: colors.borderMuted, backgroundColor: colors.cardBackground }]}>
      <View style={[styles.emptyIconRing, { backgroundColor: colors.brandMutedSurface }]}>
        <Inbox size={40} stroke={colors.pemAmber} strokeWidth={2} />
      </View>
      <PemText style={[styles.emptyTitle, { color: colors.textPrimary }]}>No preps yet</PemText>
      <PemText style={[styles.emptyBody, { color: colors.textSecondary }]}>
        Dump a thought by voice or text. Pem will turn it into preps you can open here.
      </PemText>
      <PemButton variant="primary" size="lg" onPress={() => router.push("/dump")}>
        Start a dump
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
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
    textAlign: "center",
  },
  emptyBody: {
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    textAlign: "center",
    maxWidth: 320,
  },
});
