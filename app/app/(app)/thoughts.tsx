import PemFloatingNav from "@/components/shell/PemFloatingNav";
import PemText from "@/components/ui/PemText";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { getDumpsPage } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

export default function ThoughtsScreen() {
  const { colors, resolved } = useTheme();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<
    {
      id: string;
      text: string;
      status: "processing" | "processed" | "failed";
      created_at: string;
      actionable_count: number;
    }[]
  >([]);
  const [refreshing, setRefreshing] = useState(false);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (mode: "initial" | "pull" | "more" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "pull") setRefreshing(true);
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
    } finally {
      if (mode === "initial") setLoading(false);
      if (mode === "pull") setRefreshing(false);
      if (mode === "more") loadingMoreRef.current = false;
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBackground, paddingTop: insets.top }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <PemText variant="headline" style={{ paddingHorizontal: space[4], marginBottom: space[2] }}>
        Thoughts
      </PemText>
      <PemText
        variant="bodyMuted"
        style={{ paddingHorizontal: space[4], marginBottom: space[3] }}
      >
        Each card is one dump — Pem’s polished version when ready, otherwise your
        original text.
      </PemText>

      {loading ? (
        <PemLoadingIndicator placement="pageCenter" />
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
            void load("more");
          }}
          onEndReachedThreshold={0.35}
          contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120, gap: space[3] }}
          renderItem={({ item }) => (
            <View style={[styles.card, { borderColor: colors.border }]}>
              <PemText variant="caption" style={{ color: colors.textSecondary }}>
                {new Date(item.created_at).toLocaleString()}
              </PemText>
              <PemText variant="body" style={{ marginTop: space[2] }}>
                {item.text}
              </PemText>
              <PemText variant="caption" style={{ color: colors.textSecondary, marginTop: space[2] }}>
                {item.actionable_count} item{item.actionable_count === 1 ? "" : "s"} extracted
              </PemText>
            </View>
          )}
          ListEmptyComponent={
            <PemText variant="bodyMuted">No thoughts yet. Your dumps show up here.</PemText>
          }
        />
      )}
      <PemFloatingNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: space[4],
  },
});
