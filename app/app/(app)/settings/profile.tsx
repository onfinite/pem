import {
  glassChromeBorder,
  TOP_BAR_ROW_PAD,
  TOP_ICON_CHIP,
} from "@/components/sections/home-sections/homeLayout";
import ProfileFactEditorModal from "@/components/sections/settings-sections/ProfileFactEditorModal";
import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import { PROFILE_FACTS_PAGE_SIZE } from "@/constants/limits";
import { useTheme, type ThemeSemantic } from "@/contexts/ThemeContext";
import { fontFamily, fontSize, lh, lineHeight, radii, space } from "@/constants/typography";
import {
  createProfileFact,
  deleteProfileFact,
  getUserProfileFactsPage,
  updateProfileFact,
  type ApiProfileFact,
} from "@/lib/pemApi";
import { formatProfileValueForDisplay } from "@/lib/profileTimed";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { Pencil, Sparkles, Trash2, X } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import {
  initialWindowMetrics,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

function formatFactKey(key: string): string {
  const t = key.trim();
  if (!t) return key;
  return t
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function formatUpdatedAt(iso: string): string {
  const d = Date.parse(iso);
  if (Number.isNaN(d)) return "";
  return new Date(d).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function FactRow({
  fact,
  colors,
  resolved,
  onEdit,
  onDelete,
}: {
  fact: ApiProfileFact;
  colors: ThemeSemantic;
  resolved: "light" | "dark";
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sub = formatUpdatedAt(fact.learned_at);
  const mk = fact.memory_key;
  return (
    <View
      style={[
        styles.factCard,
        {
          backgroundColor: colors.cardBackground,
          borderColor: colors.borderMuted,
        },
        Platform.select({
          ios: {
            shadowColor: "#000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: resolved === "dark" ? 0.2 : 0.05,
            shadowRadius: 6,
          },
          android: { elevation: 1 },
        }),
      ]}
    >
      <View style={styles.factTop}>
        <PemText
          style={[styles.factKey, { color: colors.textSecondary }]}
          numberOfLines={2}
        >
          {formatFactKey(mk)}
          {fact.status === "historical" ? " · Historical" : ""}
        </PemText>
        <View style={styles.factActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${formatFactKey(mk)}`}
            onPress={onEdit}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Pencil size={20} stroke={colors.pemAmber} strokeWidth={2} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${formatFactKey(mk)}`}
            onPress={onDelete}
            hitSlop={8}
            style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.75 : 1 }]}
          >
            <Trash2 size={20} stroke={colors.textSecondary} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
      <PemText selectable style={[styles.factValue, { color: colors.textPrimary }]}>
        {formatProfileValueForDisplay(fact.note)}
      </PemText>
      {sub ? (
        <PemText variant="caption" style={[styles.factMeta, { color: colors.textSecondary }]}>
          Learned {sub}
        </PemText>
      ) : null}
    </View>
  );
}

function profileFactsCacheKey(userId: string | undefined, tab: "active" | "historical") {
  return userId ? `profileFacts:v3:${userId}:${tab}` : null;
}

function formatProfileFactsError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  if (/429|too many requests|rate limit/i.test(msg)) {
    return "You’re refreshing a bit fast. Give it a second and try again.";
  }
  return msg;
}

export default function SettingsProfileScreen() {
  const insets = useSafeAreaInsets();
  const topInset =
    insets.top > 0 ? insets.top : (initialWindowMetrics?.insets.top ?? 0);
  const { colors, resolved } = useTheme();
  const glassBorder = glassChromeBorder(resolved);
  const chipFill = colors.secondarySurface;
  const { getToken, userId } = useAuth();

  const [facts, setFacts] = useState<ApiProfileFact[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /** Synchronous guard — avoids parallel paginate calls (429) before state re-renders. */
  const loadMoreInFlightRef = useRef(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<"add" | "edit">("add");
  const [editorFact, setEditorFact] = useState<ApiProfileFact | null>(null);
  const [memoryTab, setMemoryTab] = useState<"active" | "historical">("active");

  const memoryTabRef = useRef(memoryTab);
  memoryTabRef.current = memoryTab;

  const refreshLockRef = useRef<{ key: string; promise: Promise<void> } | null>(
    null,
  );

  const persistFirstPage = useCallback(
    async (
      pageFacts: ApiProfileFact[],
      cursor: string | null,
      forTab: "active" | "historical",
    ) => {
      const key = profileFactsCacheKey(userId ?? undefined, forTab);
      if (!key) return;
      await AsyncStorage.setItem(
        key,
        JSON.stringify({ v: 3, facts: pageFacts, next_cursor: cursor }),
      );
    },
    [userId],
  );

  const refreshFirstPage = useCallback(async () => {
    const tab = memoryTab;
    const lockKey = `${userId ?? ""}:${tab}`;

    const existing = refreshLockRef.current;
    if (existing && existing.key === lockKey) {
      await existing.promise;
      return;
    }

    const run = (async () => {
      setError(null);
      try {
        const data = await getUserProfileFactsPage(getToken, {
          limit: PROFILE_FACTS_PAGE_SIZE,
          status: tab,
        });
        if (memoryTabRef.current !== tab) return;
        setFacts(data.facts);
        setNextCursor(data.next_cursor);
        try {
          await persistFirstPage(data.facts, data.next_cursor, tab);
        } catch {
          /* cache is best-effort */
        }
      } catch (e) {
        if (memoryTabRef.current !== tab) return;
        setError(formatProfileFactsError(e));
      } finally {
        if (memoryTabRef.current === tab) {
          setLoading(false);
          setRefreshing(false);
        }
        const cur = refreshLockRef.current;
        if (cur?.key === lockKey) {
          refreshLockRef.current = null;
        }
      }
    })();

    refreshLockRef.current = { key: lockKey, promise: run };
    await run;
  }, [getToken, persistFirstPage, userId, memoryTab]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      if (!userId) {
        setFacts([]);
        setNextCursor(null);
        setLoading(false);
        return;
      }
      const tab = memoryTab;
      let showedCache = false;
      try {
        const key = profileFactsCacheKey(userId, tab);
        if (key) {
          const cached = await AsyncStorage.getItem(key);
          if (cached && !cancelled) {
            try {
              const parsed = JSON.parse(cached) as {
                v?: number;
                facts?: ApiProfileFact[];
                next_cursor?: string | null;
              };
              if (parsed.v === 3 && Array.isArray(parsed.facts)) {
                if (memoryTabRef.current !== tab) return;
                setFacts(parsed.facts);
                setNextCursor(parsed.next_cursor ?? null);
                setLoading(false);
                showedCache = true;
              }
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
      if (cancelled || memoryTabRef.current !== tab) return;
      if (!showedCache) {
        setFacts([]);
        setNextCursor(null);
        setLoading(true);
      }
      await refreshFirstPage();
    }
    void init().catch(() => {
      setLoading(false);
      setRefreshing(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshFirstPage, memoryTab]);

  const selectMemoryTab = useCallback(
    (tab: "active" | "historical") => {
      if (tab === memoryTab) return;
      setMemoryTab(tab);
      setError(null);
      setFacts([]);
      setNextCursor(null);
      setLoading(true);
    },
    [memoryTab],
  );

  const visibleFacts = useMemo(
    () => facts.filter((f) => f.status === memoryTab),
    [facts, memoryTab],
  );

  const endReachTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (endReachTimerRef.current) {
        clearTimeout(endReachTimerRef.current);
      }
    },
    [],
  );

  const loadMore = useCallback(async () => {
    const tabAtStart = memoryTab;
    if (!nextCursor || loadMoreInFlightRef.current) return;
    loadMoreInFlightRef.current = true;
    setLoadingMore(true);
    try {
      const data = await getUserProfileFactsPage(getToken, {
        limit: PROFILE_FACTS_PAGE_SIZE,
        cursor: nextCursor,
        status: tabAtStart,
      });
      if (memoryTabRef.current !== tabAtStart) return;
      setFacts((prev) => {
        const seen = new Set(prev.map((f) => f.id));
        const extra = data.facts.filter((f) => !seen.has(f.id));
        return [...prev, ...extra];
      });
      setNextCursor(data.next_cursor);
    } catch (e) {
      if (memoryTabRef.current !== tabAtStart) return;
      setError(formatProfileFactsError(e));
    } finally {
      loadMoreInFlightRef.current = false;
      setLoadingMore(false);
    }
  }, [getToken, nextCursor, memoryTab]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void refreshFirstPage().catch(() => {
      setLoading(false);
      setRefreshing(false);
    });
  }, [refreshFirstPage]);

  const retryLoad = useCallback(() => {
    setLoading(true);
    void refreshFirstPage();
  }, [refreshFirstPage]);

  const onEndReached = useCallback(() => {
    if (!nextCursor) return;
    if (endReachTimerRef.current) return;
    endReachTimerRef.current = setTimeout(() => {
      endReachTimerRef.current = null;
      void loadMore().catch(() => {});
    }, 400);
  }, [loadMore, nextCursor]);

  const onClose = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/settings");
    }
  }, []);

  const openAdd = useCallback(() => {
    setEditorMode("add");
    setEditorFact(null);
    setEditorOpen(true);
  }, []);

  const openEdit = useCallback((f: ApiProfileFact) => {
    setEditorMode("edit");
    setEditorFact(f);
    setEditorOpen(true);
  }, []);

  const confirmDelete = useCallback(
    (f: ApiProfileFact) => {
      const label = formatFactKey(f.memory_key);
      Alert.alert(
        "Remove this fact?",
        `“${label}” won’t be used for new preps. You can add it again anytime.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: () => {
              void (async () => {
                try {
                  await deleteProfileFact(getToken, f.id);
                  await refreshFirstPage();
                } catch (e) {
                  Alert.alert("Couldn’t delete", formatProfileFactsError(e).slice(0, 200));
                }
              })();
            },
          },
        ],
      );
    },
    [getToken, refreshFirstPage],
  );

  const handleEditorSave = useCallback(
    async (payload: { id?: string; key: string; note: string }) => {
      if (payload.id) {
        await updateProfileFact(getToken, payload.id, { key: payload.key, note: payload.note });
      } else {
        await createProfileFact(getToken, payload.key, payload.note);
      }
      await refreshFirstPage();
    },
    [getToken, refreshFirstPage],
  );

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: colors.pageBackground,
          paddingTop: topInset,
        },
      ]}
    >
      <View
        style={[
          styles.headerBackdrop,
          {
            backgroundColor: colors.pageBackground,
            borderBottomColor: glassBorder,
          },
          Platform.OS === "ios" && { borderCurve: "continuous" },
        ]}
      >
        <View style={[styles.headerInner, { paddingHorizontal: space[3] }]}>
          <View style={styles.headerRow}>
            <PemText
              accessibilityRole="header"
              numberOfLines={1}
              style={[styles.headerTitle, { color: colors.textPrimary }]}
            >
              What Pem knows
            </PemText>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={onClose}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              style={({ pressed }) => [
                styles.headerHit,
                { opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <View
                style={[
                  styles.headerChip,
                  {
                    backgroundColor: chipFill,
                    borderColor: glassBorder,
                  },
                  Platform.select({
                    ios: {
                      shadowColor: "#000",
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: resolved === "dark" ? 0.2 : 0.06,
                      shadowRadius: 4,
                    },
                    android: { elevation: resolved === "dark" ? 2 : 2 },
                  }),
                ]}
              >
                <View style={styles.headerIconSlot}>
                  <X size={20} stroke={colors.textSecondary} strokeWidth={2} />
                </View>
              </View>
            </Pressable>
          </View>
        </View>
      </View>

      <FlatList
        style={styles.scroll}
        data={visibleFacts}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.pemAmber}
            colors={[colors.pemAmber]}
          />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.4}
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: Math.max(insets.bottom, space[12]),
            paddingHorizontal: space[4],
          },
        ]}
        ListHeaderComponent={
          <>
            <View style={[styles.hero, { backgroundColor: colors.brandMutedSurface }]}>
              <View style={[styles.heroIcon, { backgroundColor: colors.cardBackground }]}>
                <Sparkles size={28} stroke={colors.pemAmber} strokeWidth={2} />
              </View>
              <PemText style={[styles.heroTitle, { color: colors.textPrimary }]}>
                Saved for you
              </PemText>
              <PemText variant="body" style={[styles.heroSub, { color: colors.textSecondary }]}>
                Natural-language memory: what Pem knows about you, with history when things change.
              </PemText>
            </View>

            <View style={styles.memoryTabsWrap}>
              <View style={styles.memoryTabs}>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: memoryTab === "active" }}
                  onPress={() => selectMemoryTab("active")}
                  style={[
                    styles.memoryTab,
                    {
                      backgroundColor:
                        memoryTab === "active" ? colors.brandMutedSurface : colors.secondarySurface,
                      borderColor: colors.borderMuted,
                    },
                  ]}
                >
                  <PemText
                    style={{
                      color: memoryTab === "active" ? colors.textPrimary : colors.textSecondary,
                      fontFamily:
                        memoryTab === "active" ? fontFamily.sans.semibold : fontFamily.sans.medium,
                    }}
                  >
                    Active
                  </PemText>
                </Pressable>
                <Pressable
                  accessibilityRole="tab"
                  accessibilityState={{ selected: memoryTab === "historical" }}
                  onPress={() => selectMemoryTab("historical")}
                  style={[
                    styles.memoryTab,
                    {
                      backgroundColor:
                        memoryTab === "historical"
                          ? colors.brandMutedSurface
                          : colors.secondarySurface,
                      borderColor: colors.borderMuted,
                    },
                  ]}
                >
                  <PemText
                    style={{
                      color:
                        memoryTab === "historical" ? colors.textPrimary : colors.textSecondary,
                      fontFamily:
                        memoryTab === "historical"
                          ? fontFamily.sans.semibold
                          : fontFamily.sans.medium,
                    }}
                  >
                    Historical
                  </PemText>
                </Pressable>
              </View>
            </View>

            {!loading && memoryTab === "active" ? (
              <PemButton size="md" onPress={openAdd} style={styles.addBtn}>
                Add a fact
              </PemButton>
            ) : null}
            {error && visibleFacts.length > 0 ? (
              <PemText variant="body" style={[styles.errorText, { color: colors.textSecondary }]}>
                {error}
              </PemText>
            ) : null}
          </>
        }
        renderItem={({ item: f }) => (
          <FactRow
            fact={f}
            colors={colors}
            resolved={resolved}
            onEdit={() => openEdit(f)}
            onDelete={() => confirmDelete(f)}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: space[3] }} />}
        ListEmptyComponent={
          loading && visibleFacts.length === 0 ? (
            <ActivityIndicator style={{ marginTop: space[8] }} color={colors.pemAmber} />
          ) : error ? (
            <View style={styles.emptyError}>
              <PemText variant="body" style={[styles.errorText, { color: colors.textSecondary }]}>
                {error}
              </PemText>
              <PemButton size="md" onPress={retryLoad} style={styles.retryBtn}>
                Try again
              </PemButton>
            </View>
          ) : (
            <View style={styles.empty}>
              <PemText style={[styles.emptyTitle, { color: colors.textPrimary }]}>
                Nothing here yet
              </PemText>
              <PemText variant="body" style={[styles.emptySub, { color: colors.textSecondary }]}>
                {memoryTab === "active"
                  ? "Tap “Add a fact” to tell Pem something useful, or let it pick things up when you prep."
                  : "When Pem replaces something it already knew, the older version appears here."}
              </PemText>
            </View>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ marginTop: space[4] }} color={colors.pemAmber} />
          ) : null
        }
      />

      <ProfileFactEditorModal
        visible={editorOpen}
        mode={editorMode}
        fact={editorFact}
        onClose={() => setEditorOpen(false)}
        onSave={handleEditorSave}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    gap: space[5],
    paddingTop: space[2],
  },
  headerBackdrop: {
    overflow: "hidden",
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: space[2],
  },
  headerInner: {
    paddingBottom: TOP_BAR_ROW_PAD,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space[3],
    minHeight: TOP_ICON_CHIP,
    paddingVertical: TOP_BAR_ROW_PAD,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.xl,
    lineHeight: lh(fontSize.xl, lineHeight.snug),
    letterSpacing: -0.3,
    textAlign: "left",
  },
  headerHit: {
    minWidth: 40,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  headerChip: {
    width: TOP_ICON_CHIP,
    height: TOP_ICON_CHIP,
    borderRadius: TOP_ICON_CHIP / 2,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconSlot: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  memoryTabsWrap: {
    marginTop: space[2],
    marginBottom: space[1],
    paddingVertical: space[2],
    paddingHorizontal: space[1],
    alignSelf: "stretch",
  },
  memoryTabs: {
    flexDirection: "row",
    gap: space[3],
    alignSelf: "stretch",
  },
  memoryTab: {
    flex: 1,
    minHeight: 48,
    paddingVertical: space[3],
    paddingHorizontal: space[4],
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    justifyContent: "center",
  },
  hero: {
    borderRadius: radii.lg,
    padding: space[5],
    gap: space[3],
    alignItems: "center",
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  heroTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
    lineHeight: lh(fontSize.lg, lineHeight.snug),
    textAlign: "center",
  },
  heroSub: {
    textAlign: "center",
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
    maxWidth: 400,
    alignSelf: "center",
  },
  addBtn: {
    alignSelf: "stretch",
  },
  factCard: {
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: space[4],
    gap: space[2],
  },
  factTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space[2],
  },
  factActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
  },
  iconBtn: {
    padding: space[1],
  },
  factKey: {
    flex: 1,
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.xs,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    minWidth: 0,
  },
  factValue: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.md,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
  },
  factMeta: {
    marginTop: space[1],
  },
  empty: {
    paddingVertical: space[6],
    gap: space[2],
    alignItems: "center",
  },
  emptyTitle: {
    fontFamily: fontFamily.display.semibold,
    fontSize: fontSize.lg,
  },
  emptySub: {
    textAlign: "center",
    maxWidth: 320,
    lineHeight: lh(fontSize.md, lineHeight.relaxed),
  },
  errorText: {
    marginTop: space[4],
    textAlign: "center",
  },
  emptyError: {
    paddingVertical: space[6],
    gap: space[4],
    alignItems: "center",
  },
  retryBtn: {
    alignSelf: "center",
    minWidth: 160,
  },
});
