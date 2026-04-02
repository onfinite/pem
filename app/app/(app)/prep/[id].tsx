import PrepDetailBody from "@/components/sections/prep-detail-sections/PrepDetailBody";
import type { Prep } from "@/components/sections/home-sections/homePrepData";
import PemButton from "@/components/ui/PemButton";
import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { prepKindCompanionLabel } from "@/lib/prepDetailLabels";
import { apiPrepToPrep, markPrepOpened } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Archive, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Full prep content — close returns to hub. */
export default function PrepDetailScreen() {
  const raw = useLocalSearchParams<{ id: string | string[] }>().id;
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const {
    getPrep,
    fetchPrepById,
    readyPreps,
    preppingPreps,
    archivePrep,
    retryPrep,
    refresh,
    upsertPrepRow,
  } = usePrepHub();
  const { getToken } = useAuth();
  const markedOpenForId = useRef<string | null>(null);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [prep, setPrep] = useState<Prep | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const syncFromHub = useCallback(() => {
    if (id === undefined) return;
    const p = getPrep(id);
    if (p) setPrep(p);
  }, [id, getPrep]);

  useEffect(() => {
    syncFromHub();
  }, [syncFromHub]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      if (id !== undefined) {
        void fetchPrepById(id);
      }
    }, [refresh, fetchPrepById, id]),
  );

  useEffect(() => {
    if (id === undefined) {
      router.replace("/home");
    }
  }, [id]);

  useEffect(() => {
    if (id === undefined || !prep || prep.status !== "ready") return;
    if (markedOpenForId.current === id) return;
    markedOpenForId.current = id;
    void (async () => {
      try {
        const row = await markPrepOpened(getToken, id);
        upsertPrepRow(row);
        setPrep(apiPrepToPrep(row));
      } catch {
        /* ignore */
      }
    })();
  }, [id, prep?.id, prep?.status, getToken, upsertPrepRow]); // eslint-disable-line react-hooks/exhaustive-deps -- mark opened once per prep id

  useEffect(() => {
    if (id === undefined) return;
    const prepId = id;
    let cancelled = false;
    async function load() {
      const local = getPrep(prepId);
      if (local) {
        setPrep(local);
        return;
      }
      const fetched = await fetchPrepById(prepId);
      if (cancelled) return;
      if (fetched) {
        setPrep(fetched);
        return;
      }
      setLoadFailed(true);
      router.replace("/home");
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, getPrep, fetchPrepById]);

  if (id === undefined) {
    return null;
  }

  if (loadFailed) {
    return null;
  }

  if (!prep) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.pageBackground }]}>
        <ActivityIndicator style={{ marginTop: space[8] }} color={colors.pemAmber} />
      </View>
    );
  }

  const canArchive =
    prep.status !== "archived" &&
    (prep.status === "ready" ||
      prep.status === "prepping" ||
      prep.status === "failed" ||
      (!prep.status &&
        (readyPreps.some((p) => p.id === prep.id) ||
          preppingPreps.some((p) => p.id === prep.id))));

  const onArchive = async () => {
    try {
      await archivePrep(prep.id);
      router.back();
    } catch {
      /* hub refresh will surface errors on next poll */
    }
  };

  const onRetry = async () => {
    setRetrying(true);
    try {
      await retryPrep(prep.id);
      const next = await fetchPrepById(prep.id);
      if (next) setPrep(next);
    } catch {
      /* apiFetch already throws readable messages (e.g. 429) */
    } finally {
      setRetrying(false);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top, backgroundColor: colors.pageBackground }]}>
      <View style={[styles.header, { paddingHorizontal: space[4] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.headerCtrl,
            pressed && { opacity: 0.75 },
          ]}
        >
          <X size={22} stroke={colors.textSecondary} strokeWidth={2} />
        </Pressable>
        {canArchive ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Archive ${prep.title}`}
            onPress={() => void onArchive()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={({ pressed }) => [
              styles.headerCtrl,
              styles.archiveCtrl,
              {
                borderColor: colors.borderMuted,
                backgroundColor: colors.secondarySurface,
                opacity: pressed ? 0.88 : 1,
              },
            ]}
          >
            <Archive size={22} stroke={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        ) : (
          <View style={styles.headerCtrl} />
        )}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: space[4],
            paddingBottom: Math.max(insets.bottom, space[6]),
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <View style={styles.heroPemRow}>
            <PemText style={[styles.pemMark, { color: colors.pemAmber }]}>Pem</PemText>
            <PemText style={[styles.heroDot, { color: colors.textSecondary }]}>·</PemText>
            <PemText style={[styles.heroKind, { color: colors.textSecondary }]}>
              {prepKindCompanionLabel(prep.kind)}
            </PemText>
          </View>
          {prep.kind !== "deep_research" ? (
            <>
              <PemText style={[styles.title, { color: colors.textPrimary }]}>{prep.title}</PemText>
              <PemMarkdown variant="body">{prep.summary}</PemMarkdown>
            </>
          ) : (
            <PemText style={[styles.researchWelcome, { color: colors.textSecondary }]}>
              Take your time — everything below is yours to use.
            </PemText>
          )}
        </View>
        {prep.status === "failed" ? (
          retrying ? (
            <ActivityIndicator style={{ alignSelf: "flex-start" }} color={colors.pemAmber} />
          ) : (
            <PemButton onPress={() => void onRetry()}>Retry</PemButton>
          )
        ) : null}
        <PrepDetailBody prep={prep} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    marginBottom: space[2],
  },
  /** Same outer box for close, archive, and placeholder — keeps icons aligned. */
  headerCtrl: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  archiveCtrl: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scroll: {
    gap: space[5],
    paddingTop: space[1],
  },
  hero: {
    gap: space[3],
  },
  heroPemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    flexWrap: "wrap",
  },
  pemMark: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.sm,
    letterSpacing: 0.3,
  },
  heroDot: {
    fontSize: fontSize.sm,
  },
  heroKind: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  researchWelcome: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
  },
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
    letterSpacing: -0.3,
  },
});
