import HomePreppingList from "@/components/sections/home-sections/HomePreppingList";
import PemText from "@/components/ui/PemText";
import { PREPPING_FLOW_MAX_WIDTH } from "@/constants/layout";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { useDumpPrepStream } from "@/hooks/useDumpPrepStream";
import { apiPrepToPrep } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { useFocusEffect, useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import type { Prep } from "@/components/sections/home-sections/homePrepData";
import { ActivityIndicator, StyleSheet, View } from "react-native";

/** Post-dump acknowledgement + in-flight rows for this dump only (hub Prepping tab shows all). */
export default function PreppingDumpFlow() {
  const { colors } = useTheme();
  const { getToken } = useAuth();
  const { dumpId: dumpIdParam } = useLocalSearchParams<{ dumpId?: string | string[] }>();
  const dumpId = useMemo(() => {
    const d = dumpIdParam;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]) return d[0];
    return undefined;
  }, [dumpIdParam]);

  const { loading, refresh, upsertPrepRow } = usePrepHub();
  const { streamDone, dumpPreps: dumpRows, loadingDumpPreps } = useDumpPrepStream(
    dumpId,
    getToken,
    upsertPrepRow,
  );

  const dumpPreps = useMemo<Prep[]>(() => dumpRows.map(apiPrepToPrep), [dumpRows]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );

  const n = dumpPreps.length;
  const waitingForDumpPreps = Boolean(dumpId) && n === 0 && !streamDone;
  const showEmptyLoading = n === 0 && (loading || waitingForDumpPreps);

  const sub = showEmptyLoading
    ? loading || loadingDumpPreps
      ? "Loading your preps…"
      : "Pem’s on it — your prep cards will show up here in a moment."
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
        {showEmptyLoading ? (
          <ActivityIndicator style={{ marginVertical: space[4] }} color={colors.pemAmber} />
        ) : (
          <HomePreppingList preps={dumpPreps} />
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
