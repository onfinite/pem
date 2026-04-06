import PemFloatingNav from "@/components/shell/PemFloatingNav";
import PemText from "@/components/ui/PemText";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { useDumpInboxStream } from "@/hooks/useDumpInboxStream";
import { getActionablesOpen, type ApiActionable } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import { ClipboardList, Settings } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";

export default function InboxScreen() {
  const { colors, resolved } = useTheme();
  const { dumpId: dumpIdParam } = useLocalSearchParams<{ dumpId?: string | string[] }>();
  const dumpId =
    typeof dumpIdParam === "string"
      ? dumpIdParam
      : Array.isArray(dumpIdParam)
        ? dumpIdParam[0]
        : null;
  const { streamDone, reset } = useDumpInboxStream(dumpId);
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [openItems, setOpenItems] = useState<ApiActionable[]>([]);
  const nextCursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const [err, setErr] = useState<string | null>(null);

  /**
   * Clerk’s `getToken` identity changes often; don’t put it in `useCallback` deps or effects
   * re-run constantly (felt like random refreshes / flicker).
   */
  const load = useCallback(
    async (mode: "initial" | "pull" | "silent" | "more" = "initial") => {
      if (mode === "initial") setLoading(true);
      if (mode === "pull") setRefreshing(true);
      if (mode !== "silent") setErr(null);
      try {
        if (mode === "more") {
          if (loadingMoreRef.current || !nextCursorRef.current) return;
          loadingMoreRef.current = true;
          const c = nextCursorRef.current;
          const res = await getActionablesOpen(() => getTokenRef.current(), {
            limit: 40,
            cursor: c,
          });
          nextCursorRef.current = res.next_cursor;
          setOpenItems((prev) => [...prev, ...res.items]);
          return;
        }
        const res = await getActionablesOpen(() => getTokenRef.current(), {
          limit: 40,
        });
        nextCursorRef.current = res.next_cursor;
        setOpenItems(res.items);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Couldn’t load inbox");
      } finally {
        if (mode === "initial") setLoading(false);
        if (mode === "pull") setRefreshing(false);
        if (mode === "more") loadingMoreRef.current = false;
      }
    },
    [],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    if (!streamDone) return;
    void load("silent");
    reset();
    // Only replace when we need to drop `dumpId` from the URL — avoids remounting this
    // screen on every stream completion (which reset loading state and felt like glitches).
    if (dumpId) {
      router.replace("/inbox");
    }
  }, [streamDone, dumpId, load, reset]);

  return (
    <View style={[styles.root, { backgroundColor: colors.pageBackground, paddingTop: insets.top }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <View style={styles.topRow}>
        <ClipboardList size={28} color={colors.textPrimary} strokeWidth={2} />
        <PemText variant="headline" style={{ flex: 1, marginLeft: space[2] }}>
          Inbox
        </PemText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings")}
          hitSlop={12}
        >
          <Settings size={24} color={colors.textSecondary} strokeWidth={2} />
        </Pressable>
      </View>
      <PemText
        variant="bodyMuted"
        style={{ paddingHorizontal: space[4], marginBottom: space[3] }}
      >
        All actionables that are not done yet (including snoozed).
      </PemText>

      {loading ? (
        <PemLoadingIndicator placement="pageCenter" />
      ) : err ? (
        <View style={styles.body}>
          <PemText variant="body" style={{ color: colors.textSecondary, padding: space[4] }}>
            {err}
          </PemText>
        </View>
      ) : (
        <FlatList
          data={openItems}
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
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: space[4],
            paddingBottom: 120,
            gap: space[2],
          }}
          renderItem={({ item }) => (
            <View style={[styles.row, { borderColor: colors.border }]}>
              <PemText variant="body" style={{ flex: 1 }}>
                {item.text}
              </PemText>
              <PemText variant="caption" style={{ color: colors.textSecondary }}>
                {item.tone}
              </PemText>
            </View>
          )}
          ListEmptyComponent={
            <PemText variant="bodyMuted" style={{ paddingVertical: space[6] }}>
              Nothing open yet. Dump something on your mind — Pem will turn it into actionables.
            </PemText>
          }
        />
      )}
      <PemFloatingNav />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1 },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingBottom: space[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: space[2],
  },
});
