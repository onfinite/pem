import HomePreppingList from "@/components/sections/home-sections/HomePreppingList";
import PemText from "@/components/ui/PemText";
import { PREPPING_FLOW_MAX_WIDTH } from "@/constants/layout";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { useDumpPrepStream } from "@/hooks/useDumpPrepStream";
import { apiPrepToPrep } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { useLocalSearchParams } from "expo-router";
import { Check } from "lucide-react-native";
import type { Prep } from "@/components/sections/home-sections/homePrepData";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Post-dump acknowledgement + in-flight rows for this dump only (hub Prepping tab shows all). */
export default function PreppingDumpFlow() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const { dumpId: dumpIdParam } = useLocalSearchParams<{ dumpId?: string | string[] }>();
  const dumpId = useMemo(() => {
    const d = dumpIdParam;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]) return d[0];
    return undefined;
  }, [dumpIdParam]);

  const { loading, upsertPrepRow, refresh } = usePrepHub();
  const { streamDone, dumpPreps: dumpRows, loadingDumpPreps, refetchDumpPreps } = useDumpPrepStream(
    dumpId,
    getToken,
    upsertPrepRow,
  );

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh({ skipCacheHydration: true });
      await refetchDumpPreps();
    } finally {
      setRefreshing(false);
    }
  }, [refresh, refetchDumpPreps]);

  const dumpPreps = useMemo<Prep[]>(() => dumpRows.map(apiPrepToPrep), [dumpRows]);

  const n = dumpPreps.length;
  const waitingForDumpPreps = Boolean(dumpId) && n === 0 && !streamDone;
  const showEmptyLoading = n === 0 && (loading || waitingForDumpPreps || refreshing);

  const sub = showEmptyLoading
    ? loading || loadingDumpPreps || refreshing
      ? "Loading your preps…"
      : "Pem’s on it — your prep cards will show up here in a moment."
    : n === 0
      ? "Nothing in flight yet — pull down to refresh, or wait a moment."
      : n === 1
        ? "1 prep in progress — it’ll land in Ready when you can act on it."
        : `${n} preps in progress — they’ll land in Ready when you can act on them.`;

  return (
    <ScrollView
      style={styles.scrollFlex}
      contentContainerStyle={[
        styles.scrollContent,
        {
          paddingTop: insets.top + space[4],
          paddingBottom: space[6],
          alignItems: "center",
          width: "100%",
        },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => void onRefresh()}
          tintColor={colors.pemAmber}
          colors={[colors.pemAmber]}
        />
      }
    >
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollFlex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space[5],
    maxWidth: "100%",
  },
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
