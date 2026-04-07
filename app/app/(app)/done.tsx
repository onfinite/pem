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
import { getDonePage, type ApiExtract } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function doneSubtitle(item: ApiExtract): string {
  if (!item.done_at) return "Handled";
  const d = new Date(item.done_at);
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
}

export default function DoneScreen() {
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
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  const load = useCallback(async (mode: "initial" | "pull" | "more" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "pull") setRefreshing(true);
    if (mode !== "more") setErr(null);
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
    } catch (e) {
      if (mode !== "more") {
        setErr(e instanceof Error ? e.message : "Couldn’t load");
      }
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
          Done
        </PemText>
      </View>
      <PemText
        variant="bodyMuted"
        style={{
          paddingHorizontal: space[5],
          marginBottom: space[2],
          color: chrome.textDim,
          fontWeight: "300",
          fontSize: fontSize.sm,
        }}
      >
        Things you actually handled.
      </PemText>

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
            style={{ marginTop: space[4], alignSelf: "flex-start", paddingVertical: space[2] }}
          >
            <PemText variant="body" style={{ color: pemAmber }}>
              Try again
            </PemText>
          </Pressable>
        </View>
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
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <PemListRow
              chrome={chrome}
              icon="✓"
              title={item.text}
              subtitle={doneSubtitle(item)}
              showChevron={false}
            />
          )}
          ListEmptyComponent={
            <PemMindEmptyState
              chrome={chrome}
              title="Nothing marked done yet."
              subtitle="When you handle something from your inbox, it shows up here."
              micHint={null}
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
    paddingBottom: space[2],
  },
  listContent: {
    flexGrow: 1,
    paddingBottom: space[10],
  },
});
