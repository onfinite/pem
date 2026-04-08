import PemListRow from "@/components/ui/PemListRow";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemMindEmptyState from "@/components/ui/PemMindEmptyState";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontFamily, space } from "@/constants/typography";
import { getDumpsPage, retryDumpExtraction } from "@/lib/pemApi";
import { router } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  View,
} from "react-native";

function formatJournalTime(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    time: d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }),
  };
}

type DumpRow = {
  id: string;
  text: string;
  status: "processing" | "processed" | "failed";
  last_error: string | null;
  created_at: string;
  extract_count: number;
};

type Props = {
  chrome: InboxChrome;
  getToken: () => Promise<string | null>;
};

export default function DumpsList({ chrome, getToken }: Props) {
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rows, setRows] = useState<DumpRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const initialLoadDoneRef = useRef(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const load = useCallback(async (mode: "initial" | "pull" | "more" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "pull") setRefreshing(true);
    if (mode !== "more") setErr(null);
    try {
      if (mode === "more") {
        if (loadingMoreRef.current || !nextCursorRef.current) return;
        loadingMoreRef.current = true;
        const res = await getDumpsPage(() => getTokenRef.current(), {
          limit: 40,
          cursor: nextCursorRef.current,
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
        setErr(e instanceof Error ? e.message : "Couldn't load dumps");
      }
    } finally {
      if (mode === "initial") { setLoading(false); initialLoadDoneRef.current = true; }
      if (mode === "pull") setRefreshing(false);
      if (mode === "more") loadingMoreRef.current = false;
    }
  }, []);

  const retryDump = useCallback(async (dumpId: string) => {
    setRetryingId(dumpId);
    try {
      await retryDumpExtraction(() => getTokenRef.current(), dumpId);
      setRows((prev) =>
        prev.map((r) =>
          r.id === dumpId
            ? { ...r, status: "processing" as const, last_error: null }
            : r,
        ),
      );
    } catch (e) {
      Alert.alert(
        "Couldn't retry",
        e instanceof Error ? e.message : "Unknown error",
      );
    } finally {
      setRetryingId(null);
    }
  }, []);

  useEffect(() => { void load("initial"); }, [load]);

  if (loading) return <PemLoadingIndicator placement="pageCenter" />;

  if (err && rows.length === 0) {
    return (
      <View style={{ paddingHorizontal: space[5], paddingTop: space[4] }}>
        <PemText variant="body" style={{ color: chrome.textMuted }}>{err}</PemText>
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
    );
  }

  return (
    <FlatList
      style={{ flex: 1 }}
      data={rows}
      keyExtractor={(item) => item.id}
      refreshControl={
        <PemRefreshControl refreshing={refreshing} onRefresh={() => void load("pull")} />
      }
      onEndReached={() => { if (initialLoadDoneRef.current) void load("more"); }}
      onEndReachedThreshold={0.35}
      contentContainerStyle={{ flexGrow: 1, paddingBottom: 120 }}
      renderItem={({ item }) => {
        const { date, time } = formatJournalTime(item.created_at);
        const sub =
          item.status === "failed"
            ? `${date} · ${time} · couldn't process`
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
            right={
              item.status === "failed" ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Retry processing this dump"
                  hitSlop={10}
                  disabled={retryingId === item.id}
                  onPress={() => void retryDump(item.id)}
                >
                  {retryingId === item.id ? (
                    <ActivityIndicator size="small" color={pemAmber} />
                  ) : (
                    <PemText
                      style={{
                        fontFamily: fontFamily.sans.semibold,
                        fontSize: 12,
                        fontWeight: "600",
                        color: pemAmber,
                      }}
                    >
                      Retry
                    </PemText>
                  )}
                </Pressable>
              ) : undefined
            }
            onPress={() => router.push({ pathname: "/thoughts/[id]", params: { id: item.id } })}
          />
        );
      }}
      ListEmptyComponent={
        <PemMindEmptyState
          chrome={chrome}
          title="No dumps yet."
          subtitle="Voice or text, messy is fine — your dumps show up here."
          micHint="tap the mic below"
        />
      }
    />
  );
}
