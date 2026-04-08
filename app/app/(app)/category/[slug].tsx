import ExtractDetailModal from "@/components/inbox/ExtractDetailModal";
import PemListRow from "@/components/ui/PemListRow";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemMindEmptyState from "@/components/ui/PemMindEmptyState";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import PemText from "@/components/ui/PemText";
import { inboxChrome } from "@/constants/inboxChrome";
import { fontSize, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import {
  getExtractsQuery,
  patchExtractDone,
  patchExtractDismiss,
  patchExtractUndone,
  type ApiExtract,
} from "@/lib/pemApi";
import { pemImpactLight, pemNotificationSuccess } from "@/lib/pemHaptics";
import { firstParam } from "@/lib/routeParams";
import { useAuth } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const SLUG_CONFIG: Record<
  string,
  { title: string; icon: string; emptyTitle: string; emptySubtitle: string; filter: Record<string, string> }
> = {
  ideas: {
    title: "Ideas",
    icon: "💡",
    emptyTitle: "No ideas yet.",
    emptySubtitle: "Dump a creative thought and Pem will catch it here.",
    filter: { tone: "idea" },
  },
  someday: {
    title: "Someday",
    icon: "🌅",
    emptyTitle: "Nothing in someday.",
    emptySubtitle: "Aspirational things land here — no pressure.",
    filter: { urgency: "someday" },
  },
  shopping: {
    title: "Shopping",
    icon: "🛒",
    emptyTitle: "Shopping list is empty.",
    emptySubtitle: "Mention shopping items in your dumps.",
    filter: { batch_key: "shopping" },
  },
  follow_ups: {
    title: "Follow-ups",
    icon: "💬",
    emptyTitle: "No follow-ups right now.",
    emptySubtitle: "Mention calls, emails, or texts in your dumps and they'll appear here.",
    filter: { batch_key: "follow_ups" },
  },
  errands: {
    title: "Errands",
    icon: "🏃",
    emptyTitle: "No errands.",
    emptySubtitle: "Mention errands in your dumps and they'll appear here.",
    filter: { batch_key: "errands" },
  },
  done: {
    title: "Done",
    icon: "✓",
    emptyTitle: "Nothing done yet.",
    emptySubtitle: "When you handle something, it shows up here.",
    filter: { status: "done" },
  },
};

export default function CategoryScreen() {
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = firstParam(params.slug) ?? "ideas";
  const config = SLUG_CONFIG[slug] ?? SLUG_CONFIG.ideas;
  const { resolved } = useTheme();
  const chrome = inboxChrome(resolved);
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [items, setItems] = useState<ApiExtract[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<ApiExtract | null>(null);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const load = useCallback(
    async (mode: "initial" | "pull" | "more" = "initial") => {
      if (mode === "initial") setLoading(true);
      if (mode === "pull") setRefreshing(true);
      if (mode !== "more") setErr(null);
      try {
        if (mode === "more") {
          if (loadingMoreRef.current || !nextCursorRef.current) return;
          loadingMoreRef.current = true;
          const res = await getExtractsQuery(() => getTokenRef.current(), {
            ...config.filter,
            limit: 40,
            cursor: nextCursorRef.current,
          } as any);
          nextCursorRef.current = res.next_cursor;
          setItems((prev) => [...prev, ...res.items]);
          return;
        }
        const res = await getExtractsQuery(() => getTokenRef.current(), {
          ...config.filter,
          limit: 40,
        } as any);
        nextCursorRef.current = res.next_cursor;
        setItems(res.items);
      } catch (e) {
        if (mode !== "more") setErr(e instanceof Error ? e.message : "Couldn't load");
      } finally {
        if (mode === "initial") setLoading(false);
        if (mode === "pull") setRefreshing(false);
        if (mode === "more") loadingMoreRef.current = false;
      }
    },
    [config.filter],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  const onDone = useCallback(async () => {
    if (!detail) return;
    pemImpactLight();
    try {
      await patchExtractDone(() => getTokenRef.current(), detail.id);
      pemNotificationSuccess();
      setDetail(null);
      void load("initial");
    } catch { /* optional */ }
  }, [detail, load]);

  const onDismiss = useCallback(async () => {
    if (!detail) return;
    pemImpactLight();
    try {
      await patchExtractDismiss(() => getTokenRef.current(), detail.id);
      setDetail(null);
      void load("initial");
    } catch { /* optional */ }
  }, [detail, load]);

  const onUndone = useCallback(async () => {
    if (!detail) return;
    pemImpactLight();
    try {
      await patchExtractUndone(() => getTokenRef.current(), detail.id);
      pemNotificationSuccess();
      setDetail(null);
      void load("initial");
    } catch { /* optional */ }
  }, [detail, load]);

  return (
    <View style={[styles.root, { backgroundColor: chrome.page, paddingTop: insets.top }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <View style={styles.top}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={24} color={chrome.text} strokeWidth={2} />
        </Pressable>
        <PemText
          style={{
            flex: 1,
            marginLeft: space[2],
            fontSize: fontSize.lg,
            fontWeight: "500",
            color: chrome.text,
          }}
        >
          {config.title}
        </PemText>
      </View>

      {loading ? (
        <PemLoadingIndicator placement="pageCenter" />
      ) : err && items.length === 0 ? (
        <View style={{ paddingHorizontal: space[5], paddingTop: space[4] }}>
          <PemText variant="body" style={{ color: chrome.textMuted }}>
            {err}
          </PemText>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load("initial")}
            style={{ marginTop: space[4] }}
          >
            <PemText variant="body" style={{ color: chrome.textMuted, textDecorationLine: "underline" }}>
              Try again
            </PemText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          refreshControl={
            <PemRefreshControl refreshing={refreshing} onRefresh={() => void load("pull")} />
          }
          onEndReached={() => void load("more")}
          onEndReachedThreshold={0.35}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <PemListRow
              chrome={chrome}
              icon={item.source === "calendar" ? "📅" : config.icon}
              title={item.text}
              subtitle={item.pem_note ?? item.tone}
              showChevron
              onPress={() => setDetail(item)}
            />
          )}
          ListEmptyComponent={
            <PemMindEmptyState
              chrome={chrome}
              title={config.emptyTitle}
              subtitle={config.emptySubtitle}
              micHint="tap the mic on Inbox"
            />
          }
        />
      )}

      <ExtractDetailModal
        visible={detail != null}
        item={detail}
        chrome={chrome}
        onClose={() => setDetail(null)}
        onDone={onDone}
        onDismiss={onDismiss}
        onUndone={onUndone}
        onItemUpdated={(updated) => setDetail(updated)}
        getToken={() => getTokenRef.current()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingBottom: space[3],
  },
  listContent: { flexGrow: 1, paddingBottom: space[10] },
});
