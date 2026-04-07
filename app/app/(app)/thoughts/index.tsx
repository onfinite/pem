import AppMenuButton from "@/components/navigation/AppMenuButton";
import PemListRow from "@/components/ui/PemListRow";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemMindEmptyState from "@/components/ui/PemMindEmptyState";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import PemText from "@/components/ui/PemText";
import { inboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontSize, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { getDumpsPage } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function formatJournalTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

export default function ThoughtsScreen() {
  const { resolved } = useTheme();
  const chrome = inboxChrome(resolved);
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<
    {
      id: string;
      text: string;
      status: "processing" | "processed" | "failed";
      last_error: string | null;
      created_at: string;
      extract_count: number;
    }[]
  >([]);
  const [refreshing, setRefreshing] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const initialLoadDoneRef = useRef(false);

  const load = useCallback(async (mode: "initial" | "pull" | "more" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "pull") setRefreshing(true);
    if (mode !== "more") setErr(null);
    try {
      if (mode === "more") {
        if (loadingMoreRef.current || !nextCursorRef.current) return;
        loadingMoreRef.current = true;
        const c = nextCursorRef.current;
        const res = await getDumpsPage(() => getTokenRef.current(), {
          limit: 40,
          cursor: c,
        });
        nextCursorRef.current = res.next_cursor;
        setRows((prev) => [...prev, ...res.dumps]);
        return;
      }
      const res = await getDumpsPage(() => getTokenRef.current(), { limit: 40 });
      nextCursorRef.current = res.next_cursor;
      setRows(res.dumps);
    } catch (e) {
      if (mode !== "more") {
        setErr(e instanceof Error ? e.message : "Couldn’t load thoughts");
      }
    } finally {
      if (mode === "initial") {
        setLoading(false);
        initialLoadDoneRef.current = true;
      }
      if (mode === "pull") setRefreshing(false);
      if (mode === "more") loadingMoreRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const openThought = useCallback((id: string) => {
    router.push({ pathname: "/thoughts/[id]", params: { id } });
  }, []);

  return (
    <View style={[styles.root, { backgroundColor: chrome.page, paddingTop: insets.top }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <View style={styles.top}>
        <AppMenuButton tintColor={chrome.text} />
        <PemText
          style={{
            flex: 1,
            marginLeft: space[2],
            fontSize: fontSize.lg,
            fontWeight: "500",
            color: chrome.text,
          }}
        >
          Thoughts
        </PemText>
      </View>

      {loading ? (
        <PemLoadingIndicator placement="pageCenter" />
      ) : err && rows.length === 0 ? (
        <View style={{ paddingHorizontal: space[5], paddingTop: space[4] }}>
          <PemText variant="body" style={{ color: chrome.textMuted }}>
            {err}
          </PemText>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load("initial")}
            style={{ marginTop: space[4], alignSelf: "flex-start", paddingVertical: space[2] }}
          >
            <PemText variant="body" style={{ color: pemAmber }}>
              Try again
            </PemText>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          refreshControl={
            <PemRefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void load("pull");
              }}
            />
          }
          onEndReached={() => {
            if (!initialLoadDoneRef.current) return;
            void load("more");
          }}
          onEndReachedThreshold={0.35}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const { date, time } = formatJournalTime(item.created_at);
            const sub =
              item.status === "failed"
                ? `${date} · ${time} · couldn’t process`
                : item.extract_count > 0
                  ? `${date} · ${time} · ${item.extract_count} extracted`
                  : `${date} · ${time}`;
            return (
              <PemListRow
                chrome={chrome}
                icon="📔"
                title={item.text}
                subtitle={sub}
                showChevron
                onPress={() => openThought(item.id)}
              />
            );
          }}
          ListEmptyComponent={
            <PemMindEmptyState
              chrome={chrome}
              title="No thoughts yet."
              subtitle="Your dumps show up here — voice or text, messy is fine."
              micHint="tap the mic on Inbox"
            />
          }
        />
      )}
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
  listContent: {
    flexGrow: 1,
    paddingBottom: space[10],
  },
});
