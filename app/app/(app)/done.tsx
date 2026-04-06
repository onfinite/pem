import PemFloatingNav from "@/components/shell/PemFloatingNav";
import PemText from "@/components/ui/PemText";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { getDonePage, type ApiActionable } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

export default function DoneScreen() {
  const { colors, resolved } = useTheme();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<ApiActionable[]>([]);
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
        const res = await getDonePage(() => getTokenRef.current(), {
          limit: 50,
          cursor: c,
        });
        nextCursorRef.current = res.next_cursor;
        setItems((prev) => [...prev, ...res.items]);
        return;
      }
      const res = await getDonePage(() => getTokenRef.current(), { limit: 50 });
      nextCursorRef.current = res.next_cursor;
      setItems(res.items);
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
        Done
      </PemText>
      <PemText variant="bodyMuted" style={{ paddingHorizontal: space[4], marginBottom: space[3] }}>
        Things you actually handled.
      </PemText>

      {loading ? (
        <PemLoadingIndicator placement="pageCenter" />
      ) : (
        <FlatList
          data={items}
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
          contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120, gap: space[2] }}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <PemText variant="body">✓ {item.text}</PemText>
              <PemText variant="caption" style={{ color: colors.textSecondary }}>
                {item.done_at ? new Date(item.done_at).toLocaleString() : ""}
              </PemText>
            </View>
          )}
          ListEmptyComponent={
            <PemText variant="bodyMuted">Nothing marked done yet.</PemText>
          }
        />
      )}
      <PemFloatingNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  row: { paddingVertical: space[2], gap: space[1] },
});
