import HomePreppingList from "@/components/sections/home-sections/HomePreppingList";
import PemText from "@/components/ui/PemText";
import { PREPPING_FLOW_MAX_WIDTH } from "@/constants/layout";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { useFocusEffect } from "expo-router";
import { Check } from "lucide-react-native";
import { useCallback } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

/** Post-dump acknowledgement + same in-flight rows as the hub Prepping tab; CTA is the screen footer. */
export default function PreppingDumpFlow() {
  const { colors } = useTheme();
  const { preppingPreps, loading, refresh } = usePrepHub();

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const n = preppingPreps.length;
  const sub =
    loading && n === 0
      ? "Loading your preps…"
      : n === 0
        ? "Nothing in flight yet — pull to refresh from Home, or wait a moment."
        : n === 1
          ? "1 prep in progress — it’ll land in Ready when you can act on it."
          : `${n} preps in progress — they’ll land in Ready when you can act on them.`;

  return (
    <View style={styles.root}>
      <View style={styles.hero}>
        <View style={[styles.iconBadge, { backgroundColor: colors.brandMutedSurface }]}>
          <Check size={36} stroke={colors.pemAmber} strokeWidth={2.5} />
        </View>
        <PemText style={[styles.headline, { color: colors.textPrimary }]}>Pem’s got it.</PemText>
        <PemText variant="body" style={[styles.sub, { color: colors.textSecondary }]}>
          {sub}
        </PemText>
      </View>

      <View style={styles.listSection}>
        <PemText variant="bodyMuted" style={[styles.listLabel, { color: colors.textSecondary }]}>
          {n === 0 ? "In flight" : `In flight (${n})`}
        </PemText>
        {loading && n === 0 ? (
          <ActivityIndicator style={{ marginVertical: space[4] }} color={colors.pemAmber} />
        ) : (
          <HomePreppingList />
        )}
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
    alignItems: "stretch",
  },
  hero: {
    gap: space[3],
    width: "100%",
    alignItems: "center",
  },
  listSection: {
    gap: space[2],
    width: "100%",
  },
  listLabel: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    textAlign: "center",
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
});
