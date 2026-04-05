import PrepDetailBody from "@/components/sections/prep-detail-sections/PrepDetailBody";
import type { Prep } from "@/components/sections/home-sections/homePrepData";
import PemButton from "@/components/ui/PemButton";
import PemConfirmModal from "@/components/ui/PemConfirmModal";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { pemImpactLight, pemSelection } from "@/lib/pemHaptics";
import { apiPrepToPrep, markPrepOpened } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Archive, ArchiveRestore, Trash2, X } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager, Pressable, ScrollView, StyleSheet, View } from "react-native";
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
    unarchivePrep,
    deletePrep,
    scheduleHomeNavigationIntent,
    showHubToast,
    retryPrep,
    refresh,
    upsertPrepRow,
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
  const [archiveModalVisible, setArchiveModalVisible] = useState(false);
  const [deleteModalVisible, setDeleteModalVisible] = useState(false);

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
        <PemLoadingIndicator placement="pageCenter" />
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

  const canUnarchive = prep.status === "archived";
  const canDelete = prep.dumpId !== undefined;

  const openArchiveModal = () => {
    pemImpactLight();
    setArchiveModalVisible(true);
  };

  const confirmArchive = async () => {
    setArchiveModalVisible(false);
    pemSelection();
    try {
      await archivePrep(prep.id);
      scheduleHomeNavigationIntent("ready");
      router.replace("/home");
    } catch {
      /* hub refresh will surface errors on next poll */
    }
  };

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

  const openDeleteModal = () => {
    pemImpactLight();
    setDeleteModalVisible(true);
  };

  const confirmDelete = () => {
    setDeleteModalVisible(false);
    pemSelection();
    const prepId = prep.id;
    InteractionManager.runAfterInteractions(() => {
      setTimeout(() => {
        void (async () => {
          try {
            await deletePrep(prepId);
            scheduleHomeNavigationIntent("ready");
            router.replace("/home");
          } catch {
            /* refresh on next visit */
          }
        })();
      }, 48);
    });
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
      <View style={[styles.header, { paddingHorizontal: space[4] }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => {
            pemImpactLight();
            router.back();
          }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={({ pressed }) => [
            styles.headerCtrl,
            pressed && { opacity: 0.75 },
          ]}
        >
          <X size={22} stroke={colors.textSecondary} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerActions}>
          {canUnarchive ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restore to Ready"
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
          ) : null}
          {canArchive ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Archive ${prep.title}`}
              onPress={openArchiveModal}
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
          ) : null}
          {canDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete prep"
              onPress={openDeleteModal}
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
              <Trash2 size={22} stroke={colors.error} strokeWidth={2} />
            </Pressable>
          ) : null}
          {!canUnarchive && !canArchive && !canDelete ? <View style={styles.headerCtrl} /> : null}
        </View>
      </View>

      <PemConfirmModal
        visible={archiveModalVisible}
        title="Archive this prep?"
        body="It will move to Archived. You can restore it to Ready anytime from there or from this prep."
        confirmLabel="Archive"
        onCancel={() => setArchiveModalVisible(false)}
        onConfirm={() => {
          void confirmArchive();
        }}
      />

      <PemConfirmModal
        visible={deleteModalVisible}
        title="Delete this prep?"
        body="This can't be undone. Pem will remove it from your hub and stop any in-progress work for this prep."
        confirmLabel="Delete"
        confirmDestructive
        onCancel={() => setDeleteModalVisible(false)}
        onConfirm={() => {
          void confirmDelete();
        }}
      />

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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
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
    gap: space[2],
  },
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
    letterSpacing: -0.3,
  },
});
