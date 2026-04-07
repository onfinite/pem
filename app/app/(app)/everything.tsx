import AppMenuButton from "@/components/navigation/AppMenuButton";
import PemListRow from "@/components/ui/PemListRow";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemMindEmptyState from "@/components/ui/PemMindEmptyState";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import PemText from "@/components/ui/PemText";
import { inboxChrome } from "@/constants/inboxChrome";
import { pemAmber } from "@/constants/theme";
import { fontSize, fontFamily, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { getInboxAll, type ApiExtract } from "@/lib/pemApi";
import { useAuth } from "@clerk/expo";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const BATCH_LABEL: Record<string, string> = {
  shopping: "Shopping list",
  calls: "Calls to make",
  emails: "Emails to send",
  errands: "Errands",
};

function batchEmoji(batchKey: string): string {
  if (batchKey === "shopping") return "🛒";
  if (batchKey === "calls") return "📞";
  if (batchKey === "emails") return "📧";
  if (batchKey === "errands") return "📍";
  return "◆";
}

function extractEmoji(item: ApiExtract): string {
  return batchEmoji(item.batch_key ?? "");
}

function urgencySubtitle(item: ApiExtract): string {
  const parts = [item.urgency.replace(/_/g, " ")];
  if (item.tone) parts.push(item.tone);
  return parts.join(" · ");
}

function CountPill({ count, chrome }: { count: number; chrome: ReturnType<typeof inboxChrome> }) {
  return (
    <View
      style={[
        styles.countPill,
        {
          backgroundColor: chrome.amberSoft,
          borderColor: chrome.amberBorder,
        },
      ]}
    >
      <PemText
        style={{
          fontFamily: fontFamily.sans.semibold,
          fontSize: 10,
          fontWeight: "600",
          color: pemAmber,
        }}
      >
        {count}
      </PemText>
    </View>
  );
}

export default function EverythingScreen() {
  const { resolved } = useTheme();
  const chrome = inboxChrome(resolved);
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [data, setData] = useState<Awaited<ReturnType<typeof getInboxAll>> | null>(null);

  const load = useCallback(async (mode: "initial" | "pull" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "pull") setRefreshing(true);
    setErr(null);
    try {
      const res = await getInboxAll(() => getTokenRef.current());
      setData(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn’t load");
    } finally {
      if (mode === "initial") setLoading(false);
      if (mode === "pull") setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load("initial");
  }, [load]);

  const isGloballyEmpty = useMemo(() => {
    if (!data) return false;
    const batchTotal = data.batch_slots.reduce((n, s) => n + s.count, 0);
    return (
      data.this_week.length === 0 &&
      data.ideas.length === 0 &&
      data.someday.length === 0 &&
      batchTotal === 0
    );
  }, [data]);

  return (
    <View style={[styles.root, { backgroundColor: chrome.page, paddingTop: insets.top }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <View style={[styles.header, { borderBottomColor: chrome.border }]}>
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
          Everything
        </PemText>
      </View>

      {loading && !data ? (
        <PemLoadingIndicator placement="pageCenter" />
      ) : err && !data ? (
        <View style={{ padding: space[5] }}>
          <PemText variant="body" style={{ color: chrome.textMuted }}>
            {err}
          </PemText>
          <Pressable
            accessibilityRole="button"
            onPress={() => void load("initial")}
            style={{ marginTop: space[4], alignSelf: "flex-start" }}
          >
            <PemText variant="body" style={{ color: pemAmber }}>
              Try again
            </PemText>
          </Pressable>
        </View>
      ) : data && isGloballyEmpty ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          refreshControl={
            <PemRefreshControl refreshing={refreshing} onRefresh={() => void load("pull")} />
          }
        >
          <PemMindEmptyState
            chrome={chrome}
            title="Nothing on your mind right now."
            subtitle="When something comes up — driving, in bed, between meetings — dump it from Inbox."
            micHint={null}
          />
        </ScrollView>
      ) : data ? (
        <ScrollView
          contentContainerStyle={{ paddingBottom: space[10] }}
          refreshControl={
            <PemRefreshControl refreshing={refreshing} onRefresh={() => void load("pull")} />
          }
        >
          <SectionTitle chrome={chrome} title="This week" />
          {data.this_week.length === 0 ? (
            <EmptyLine chrome={chrome} text="Nothing scheduled this week." />
          ) : (
            data.this_week.map((item) => (
              <PemListRow
                key={item.id}
                chrome={chrome}
                icon={extractEmoji(item)}
                title={item.text}
                subtitle={urgencySubtitle(item)}
                showChevron={false}
              />
            ))
          )}

          <SectionTitle chrome={chrome} title="Grouped" />
          {data.batch_slots.every((s) => s.count === 0) ? (
            <EmptyLine chrome={chrome} text="No batches yet." />
          ) : (
            data.batch_slots
              .filter((s) => s.count > 0)
              .map((slot) => {
                const label = BATCH_LABEL[slot.batch_key] ?? slot.batch_key;
                const preview = slot.items
                  .slice(0, 2)
                  .map((i) => i.text)
                  .join(" · ");
                return (
                  <PemListRow
                    key={slot.batch_key}
                    chrome={chrome}
                    icon={batchEmoji(slot.batch_key)}
                    title={label}
                    subtitle={preview || "—"}
                    showChevron={false}
                    right={<CountPill count={slot.count} chrome={chrome} />}
                  />
                );
              })
          )}

          <SectionTitle chrome={chrome} title="Ideas" />
          {data.ideas.length === 0 ? (
            <EmptyLine chrome={chrome} text="No ideas yet — they surface from your dumps." />
          ) : (
            data.ideas.map((item) => (
              <PemListRow
                key={item.id}
                chrome={chrome}
                icon="💡"
                title={item.text}
                subtitle={urgencySubtitle(item)}
                showChevron={false}
              />
            ))
          )}

          <SectionTitle chrome={chrome} title="Someday" />
          {data.someday.length === 0 ? (
            <EmptyLine chrome={chrome} text="Nothing in someday." />
          ) : (
            data.someday.map((item) => (
              <PemListRow
                key={item.id}
                chrome={chrome}
                icon={extractEmoji(item)}
                title={item.text}
                subtitle={urgencySubtitle(item)}
                showChevron={false}
              />
            ))
          )}
        </ScrollView>
      ) : (
        <PemLoadingIndicator placement="pageCenter" />
      )}
    </View>
  );
}

function SectionTitle({ title, chrome }: { title: string; chrome: ReturnType<typeof inboxChrome> }) {
  return (
    <PemText variant="caption" style={[styles.sec, { color: chrome.textDim }]}>
      {title.toUpperCase()}
    </PemText>
  );
}

function EmptyLine({ text, chrome }: { text: string; chrome: ReturnType<typeof inboxChrome> }) {
  return (
    <PemText
      variant="bodyMuted"
      style={{
        paddingHorizontal: space[5],
        paddingVertical: space[2],
        color: chrome.textDim,
        fontWeight: "300",
        fontSize: fontSize.sm,
      }}
    >
      {text}
    </PemText>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingBottom: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sec: {
    letterSpacing: 1.4,
    paddingHorizontal: space[5],
    paddingTop: space[6],
    paddingBottom: space[2],
  },
  countPill: {
    paddingHorizontal: space[2],
    paddingVertical: 4,
    borderRadius: 7,
    borderWidth: 1,
  },
});
