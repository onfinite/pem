import ExtractDetailModal from "@/components/inbox/ExtractDetailModal";
import DumpBar from "@/components/inbox/DumpBar";
import GlanceRow from "@/components/inbox/GlanceRow";
import InboxHeader from "@/components/inbox/InboxHeader";
import PemStatementBlock from "@/components/inbox/PemStatementBlock";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemMindEmptyState from "@/components/ui/PemMindEmptyState";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import PemText from "@/components/ui/PemText";
import { inboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { useDumpInboxStream } from "@/hooks/useDumpInboxStream";
import {
  getInboxAll,
  getInboxToday,
  patchExtractDismiss,
  patchExtractDone,
  type ApiExtract,
} from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function statementCopy(todayCount: number): { headline: string; sub: string } {
  if (todayCount === 0) {
    return {
      headline: "Nothing needs you right now.",
      sub: "When something lands, it will show up here — calm and clear.",
    };
  }
  if (todayCount === 1) {
    return {
      headline: "One thing could use you today.",
      sub: "Nothing loud — just one thread to pull when you have a moment.",
    };
  }
  return {
    headline: `${todayCount} things need you today.`,
    sub: "Pick what matters; the rest can wait.",
  };
}

export default function InboxHomeScreen() {
  const { resolved } = useTheme();
  const chrome = inboxChrome(resolved);
  const insets = useSafeAreaInsets();
  const { dumpId: dumpIdParam } = useLocalSearchParams<{ dumpId?: string | string[] }>();
  const dumpId =
    typeof dumpIdParam === "string"
      ? dumpIdParam
      : Array.isArray(dumpIdParam)
        ? dumpIdParam[0]
        : null;
  const { streamDone, reset } = useDumpInboxStream(dumpId);
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [today, setToday] = useState<ApiExtract[]>([]);
  const [somedayPreview, setSomedayPreview] = useState<string[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiExtract | null>(null);

  const load = useCallback(async (mode: "initial" | "pull" | "silent" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "pull") setRefreshing(true);
    if (mode !== "silent") setErr(null);
    try {
      const [t, all] = await Promise.all([
        getInboxToday(() => getTokenRef.current()),
        getInboxAll(() => getTokenRef.current()),
      ]);
      setToday(t.today);
      setSomedayPreview(all.someday.slice(0, 4).map((a) => a.text));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t load inbox");
    } finally {
      if (mode === "initial") setLoading(false);
      if (mode === "pull") setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  useEffect(() => {
    if (!streamDone) return;
    void load("silent");
    reset();
    if (dumpId) {
      router.replace("/inbox");
    }
  }, [streamDone, dumpId, load, reset]);

  const statement = useMemo(() => statementCopy(today.length), [today.length]);
  const dateLine = useMemo(() => {
    const d = new Date();
    return `${d.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    })} · ${greeting()}`;
  }, []);

  const onDone = useCallback(async () => {
    if (!detail) return;
    try {
      await patchExtractDone(() => getTokenRef.current(), detail.id);
      setDetail(null);
      void load("silent");
    } catch {
      /* toast optional */
    }
  }, [detail, load]);

  const onDismiss = useCallback(async () => {
    if (!detail) return;
    try {
      await patchExtractDismiss(() => getTokenRef.current(), detail.id);
      setDetail(null);
      void load("silent");
    } catch {
      /* optional */
    }
  }, [detail, load]);

  return (
    <View style={[styles.root, { backgroundColor: chrome.page, paddingTop: insets.top }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <InboxHeader chrome={chrome} />

      {loading ? (
        <PemLoadingIndicator placement="pageCenter" />
      ) : err ? (
        <PemText variant="body" style={{ color: chrome.textMuted, padding: space[4] }}>
          {err}
        </PemText>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <PemRefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                void load("pull");
              }}
            />
          }
        >
          <PemStatementBlock
            chrome={chrome}
            dateLine={dateLine}
            headline={statement.headline}
            subline={statement.sub}
            showBody={today.length > 0}
          />

          <View style={[styles.sep, { backgroundColor: chrome.border }]} />

          {today.length > 0 ? (
            <View style={styles.secLabel}>
              <View style={[styles.dot, { backgroundColor: pemAmber }]} />
              <PemText variant="caption" style={{ color: chrome.textDim, letterSpacing: 1.4 }}>
                NEEDS YOU TODAY
              </PemText>
            </View>
          ) : null}

          <View style={{ paddingHorizontal: space[4], gap: space[2], paddingBottom: space[2] }}>
            {today.length === 0 ? (
              <PemMindEmptyState
                chrome={chrome}
                showBrand={false}
                title="Nothing needs you right now."
                subtitle="When something comes up — driving, in bed, between meetings — dump it below."
                micHint="tap the mic below"
              />
            ) : (
              today.map((item) => (
                <GlanceRow
                  key={item.id}
                  item={item}
                  chrome={chrome}
                  onPress={() => setDetail(item)}
                />
              ))
            )}
          </View>

          <View style={[styles.sep, { backgroundColor: chrome.border }]} />

          {somedayPreview.length > 0 ? (
            <View style={{ paddingHorizontal: space[6], paddingTop: space[4] }}>
              <PemText variant="bodyMuted" style={{ color: chrome.textDim, lineHeight: 22 }}>
                Someday — {somedayPreview.slice(0, 3).join(" · ")}
                {somedayPreview.length > 3 ? "…" : ""}
              </PemText>
            </View>
          ) : null}
        </ScrollView>
      )}

      <DumpBar resolved={resolved} />

      <ExtractDetailModal
        visible={detail != null}
        item={detail}
        chrome={chrome}
        onClose={() => setDetail(null)}
        onDone={onDone}
        onDismiss={onDismiss}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingBottom: 120 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: space[4], marginHorizontal: space[6] },
  secLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space[6],
    marginBottom: space[2],
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
