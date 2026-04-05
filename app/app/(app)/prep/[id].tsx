import PrepDetailBody from "@/components/sections/prep-detail-sections/PrepDetailBody";
import type { Prep } from "@/components/sections/home-sections/homePrepData";
import PemButton from "@/components/ui/PemButton";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { pemImpactLight, pemSelection } from "@/lib/pemHaptics";
import { apiPrepToPrep, markPrepOpened } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ArchiveRestore, ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Full prep content — back returns to hub. */
export default function PrepDetailScreen() {
  const raw = useLocalSearchParams<{ id: string | string[] }>().id;
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const {
    getPrep,
    fetchPrepById,
    unarchivePrep,
    scheduleHomeNavigationIntent,
    showHubToast,
    retryPrep,
    refresh,
    upsertPrepRow,
    markPrepOpenedOptimistic,
    setPrepDone,
  } = usePrepHub();
  const { getToken } = useAuth();
  const markedOpenForId = useRef<string | null>(null);
  const prepScrollRef = useRef<ScrollView | null>(null);
  /** Keeps vertical offset for composite brief `measureInWindow` scroll-to-section (Fabric-safe). */
  const prepScrollOffsetY = useRef(0);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [prep, setPrep] = useState<Prep | undefined>(undefined);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [doneWorking, setDoneWorking] = useState(false);

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
    markPrepOpenedOptimistic(id);
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
  }, [id, prep, getToken, upsertPrepRow, markPrepOpenedOptimistic]);

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
        <PemLoadingIndicator placement="pageCenter" />
      </View>
    );
  }

  const canUnarchive = prep.status === "archived";
  const showDoneActions = prep.status === "ready" || prep.status === "done";
  const isDone = prep.done === true;

  const onUnarchive = async () => {
    pemImpactLight();
    try {
      await unarchivePrep(prep.id);
      const next = await fetchPrepById(prep.id);
      if (next) setPrep(next);
    } catch {
      /* ignore */
    }
  };

  const onToggleDone = async () => {
    if (!showDoneActions || doneWorking) return;
    pemSelection();
    setDoneWorking(true);
    try {
      await setPrepDone(prep.id, !isDone);
      scheduleHomeNavigationIntent(isDone ? "ready" : "done", isDone ? "Moved to Inbox" : "Marked done");
      router.replace("/home");
    } catch {
      /* setPrepDone shows toast */
    } finally {
      setDoneWorking(false);
    }
  };

  const onRetry = async () => {
    setRetrying(true);
    try {
      await retryPrep(prep.id);
      showHubToast("Prep queued again");
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
      <View
        style={[
          styles.header,
          {
            paddingLeft: insets.left,
            paddingRight: space[4],
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => {
            pemImpactLight();
            router.back();
          }}
          hitSlop={{ top: 12, bottom: 12, left: 4, right: 12 }}
          style={({ pressed }) => [styles.backRow, pressed && { opacity: 0.75 }]}
        >
          <ChevronLeft size={26} stroke={colors.textPrimary} strokeWidth={2.25} />
          <PemText style={[styles.backLabel, { color: colors.textPrimary }]}>Back</PemText>
        </Pressable>
        <View style={styles.headerActions}>
          {canUnarchive ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restore to Inbox"
              onPress={() => void onUnarchive()}
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
              <ArchiveRestore size={22} stroke={colors.pemAmber} strokeWidth={2} />
            </Pressable>
          ) : (
            <View style={styles.headerCtrl} />
          )}
        </View>
      </View>

      <ScrollView
        ref={prepScrollRef}
        onScroll={(e) => {
          prepScrollOffsetY.current = e.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scroll,
          {
            paddingHorizontal: space[4],
            paddingBottom: Math.max(insets.bottom, space[6]),
          },
        ]}
        removeClippedSubviews={false}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.hero}>
          <PemText style={[styles.title, { color: colors.textPrimary }]}>{prep.title}</PemText>
        </View>
        {prep.status === "failed" ? (
          retrying ? (
            <PemLoadingIndicator placement="inlineStart" />
          ) : (
            <PemButton onPress={() => void onRetry()}>Retry</PemButton>
          )
        ) : null}
        <PrepDetailBody
          prep={prep}
          parentScrollViewRef={prepScrollRef}
          parentScrollOffsetYRef={prepScrollOffsetY}
        />
        {showDoneActions ? (
          doneWorking ? (
            <PemLoadingIndicator placement="inlineStart" />
          ) : (
            <PemButton
              variant={isDone ? "secondary" : "primary"}
              onPress={() => void onToggleDone()}
            >
              {isDone ? "Move to Inbox" : "Done"}
            </PemButton>
          )
        ) : null}
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
  /** Chevron + label — hug the leading edge (padding only from safe area). */
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    minHeight: 44,
    paddingRight: space[2],
  },
  backLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.md,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    flexShrink: 0,
  },
  /** Same outer box for archive actions and placeholder — keeps icons aligned. */
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
    gap: space[2],
  },
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
    letterSpacing: -0.3,
  },
});
