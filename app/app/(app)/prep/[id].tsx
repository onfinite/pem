import PrepDetailActivity from "@/components/sections/prep-detail-sections/PrepDetailActivity";
import PrepDetailBody from "@/components/sections/prep-detail-sections/PrepDetailBody";
import type { Prep } from "@/components/sections/home-sections/homePrepData";
import { prepKindTagColor } from "@/components/sections/home-sections/homePrepData";
import PemButton from "@/components/ui/PemButton";
import PemMarkdown from "@/components/ui/PemMarkdown";
import PemText from "@/components/ui/PemText";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, space } from "@/constants/typography";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { Archive, X } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Full prep content — close returns to hub. */
export default function PrepDetailScreen() {
  const raw = useLocalSearchParams<{ id: string | string[] }>().id;
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const { getPrep, fetchPrepById, readyPreps, preppingPreps, archivePrep, retryPrep, refresh } =
    usePrepHub();
  const { colors, resolved } = useTheme();
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
        <PemText style={[styles.tag, { color: prepKindTagColor(prep.kind, resolved) }]}>
          {prep.tag}
        </PemText>
        <PemText style={[styles.title, { color: colors.textPrimary }]}>{prep.title}</PemText>
        <PemMarkdown>{prep.summary}</PemMarkdown>
        {prep.status === "failed" ? (
          retrying ? (
            <ActivityIndicator style={{ alignSelf: "flex-start" }} color={colors.pemAmber} />
          ) : (
            <PemButton onPress={() => void onRetry()}>Retry</PemButton>
          )
        ) : null}
        <PrepDetailActivity prepId={prep.id} />
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
    gap: space[4],
    paddingTop: space[1],
  },
  tag: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  title: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xxl,
    lineHeight: lh(fontSize.xxl, lineHeight.snug),
    letterSpacing: -0.3,
  },
});
