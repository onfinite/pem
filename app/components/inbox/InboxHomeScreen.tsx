import DumpSuccessOverlay from "@/components/inbox/DumpSuccessOverlay";
import DumpsList from "@/components/inbox/DumpsList";
import ExtractDetailModal from "@/components/inbox/ExtractDetailModal";
import GlanceRow from "@/components/inbox/GlanceRow";
import InlineVoiceBar from "@/components/inbox/InlineVoiceBar";
import PemResponseSheet from "@/components/inbox/PemResponseSheet";
import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemRefreshControl from "@/components/ui/PemRefreshControl";
import PemText from "@/components/ui/PemText";
import { inboxChrome } from "@/constants/inboxChrome";
import { fontFamily, fontSize, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import { useDumpInboxStream } from "@/hooks/useDumpInboxStream";
import {
  getBrief,
  getInboxAll,
  patchExtractDismiss,
  patchExtractDone,
  patchExtractUndone,
  type ApiExtract,
  type BriefResponse,
} from "@/lib/pemApi";
import { pemImpactLight, pemNotificationSuccess } from "@/lib/pemHaptics";
import { useAuth, useUser } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import type { LucideIcon } from "lucide-react-native";
import { Inbox, Settings } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Image, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Tab = "brief" | "dumps";

type InboxAllData = {
  someday: ApiExtract[];
  batch_groups: { batch_key: string; items: ApiExtract[] }[];
};

const BATCH_LABELS: Record<string, string> = {
  shopping: "Shopping",
  follow_ups: "Follow-ups",
  errands: "Errands",
};

/** Same inset as header + tabs — all Brief content aligns to this. */
const BRIEF_INSET = space[5];

function statementCopy(
  todayCount: number,
  overdueCount: number,
  tomorrowCount: number,
  weekCount: number,
): string {
  if (overdueCount > 0 && todayCount > 0)
    return `${overdueCount} overdue and ${todayCount} for today. Let's clear the overdue first.`;
  if (overdueCount > 0)
    return `${overdueCount} overdue. Let's handle ${overdueCount === 1 ? "it" : "those"} first.`;
  if (todayCount === 0 && tomorrowCount === 0 && weekCount === 0)
    return "Your mind is clear. Dump a thought whenever you need to — I'll organize it.";
  if (todayCount === 0 && tomorrowCount > 0)
    return `Nothing for today. ${tomorrowCount} ${tomorrowCount === 1 ? "thing" : "things"} lined up for tomorrow.`;
  if (todayCount === 0)
    return "Nothing needs you today. Enjoy the quiet.";
  if (todayCount === 1)
    return "Just one thing today — nothing loud, just a thread to pull when ready.";
  if (todayCount <= 3)
    return `${todayCount} things today. All manageable — pick what matters.`;
  return `${todayCount} things on your plate. Start anywhere; the rest will wait.`;
}

function formatTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function InboxHomeScreen() {
  const { resolved } = useTheme();
  const chrome = inboxChrome(resolved);
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const { dumpId: dumpIdParam } = useLocalSearchParams<{ dumpId?: string | string[] }>();
  const dumpIdFromRoute =
    typeof dumpIdParam === "string"
      ? dumpIdParam
      : Array.isArray(dumpIdParam)
        ? dumpIdParam[0]
        : null;
  /** Inline bar (dump mode) returns dumpId here so we open SSE without relying on URL params. */
  const [pendingStreamDumpId, setPendingStreamDumpId] = useState<string | null>(null);
  const streamDumpId = pendingStreamDumpId ?? dumpIdFromRoute;

  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [tab, setTab] = useState<Tab>("brief");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [brief, setBrief] = useState<BriefResponse | null>(null);
  const [allData, setAllData] = useState<InboxAllData | null>(null);
  const [tomorrowExpanded, setTomorrowExpanded] = useState(true);
  /** Start expanded so counts match visible rows (shopping / this week aren't hidden). */
  const [weekExpanded, setWeekExpanded] = useState(true);
  const [nextWeekExpanded, setNextWeekExpanded] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [detail, setDetail] = useState<ApiExtract | null>(null);
  const [dumpSuccess, setDumpSuccess] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [pemAnswer, setPemAnswer] = useState<string | null>(null);
  const [pemSources, setPemSources] = useState<{ id: string; text: string }[]>([]);

  const load = useCallback(async (mode: "initial" | "pull" | "silent" = "initial") => {
    if (mode === "initial") setLoading(true);
    if (mode === "pull") setRefreshing(true);
    if (mode !== "silent") setErr(null);
    try {
      const [b, all] = await Promise.all([
        getBrief(() => getTokenRef.current()),
        getInboxAll(() => getTokenRef.current()),
      ]);
      setBrief(b);
      setAllData({ someday: all.someday, batch_groups: all.batch_groups });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't load inbox");
    } finally {
      if (mode === "initial") setLoading(false);
      if (mode === "pull") setRefreshing(false);
    }
  }, []);

  const loadSilentRef = useRef(() => {});
  loadSilentRef.current = () => void load("silent");

  const { streamDone, reset } = useDumpInboxStream(streamDumpId, {
    onInboxProgress: () => loadSilentRef.current(),
  });

  useEffect(() => { void load("initial"); }, [load]);

  useEffect(() => {
    if (!streamDone) return;
    void load("silent");
    reset();
    setPendingStreamDumpId(null);
    if (dumpIdFromRoute) router.replace("/inbox");
  }, [streamDone, dumpIdFromRoute, load, reset]);

  const firstName = user?.firstName ?? "there";

  const dateLine = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
  }, []);

  const statement = useMemo(() => {
    const fromApi = brief?.statement?.trim();
    if (fromApi) return fromApi;
    if (!brief) return "";
    return statementCopy(
      brief.today.length,
      brief.overdue.length,
      brief.tomorrow.length,
      brief.this_week.length,
    );
  }, [brief]);

  const onDone = useCallback(async () => {
    if (!detail) return;
    pemImpactLight();
    try {
      await patchExtractDone(() => getTokenRef.current(), detail.id);
      pemNotificationSuccess();
      setDetail(null);
      void load("silent");
    } catch { /* optional */ }
  }, [detail, load]);

  const onDismiss = useCallback(async () => {
    if (!detail) return;
    pemImpactLight();
    try {
      await patchExtractDismiss(() => getTokenRef.current(), detail.id);
      setDetail(null);
      void load("silent");
    } catch { /* optional */ }
  }, [detail, load]);

  const onUndone = useCallback(async () => {
    if (!detail) return;
    pemImpactLight();
    try {
      await patchExtractUndone(() => getTokenRef.current(), detail.id);
      pemNotificationSuccess();
      setDetail(null);
      void load("silent");
    } catch { /* optional */ }
  }, [detail, load]);

  const hasOverdue = (brief?.overdue.length ?? 0) > 0;
  const hasToday = (brief?.today.length ?? 0) > 0;
  const hasTomorrow = (brief?.tomorrow.length ?? 0) > 0;
  const hasWeek = (brief?.this_week.length ?? 0) > 0;
  const hasNextWeek = (brief?.next_week.length ?? 0) > 0;
  const batchGroups = allData?.batch_groups.filter((g) => g.items.length > 0) ?? [];
  const somedayItems = allData?.someday ?? [];
  const hasAnything = hasOverdue || hasToday || hasTomorrow || hasWeek || hasNextWeek;

  return (
    <View style={[styles.root, { backgroundColor: chrome.page, paddingTop: insets.top }]}>
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />

      {/* ── Header ─────────────────────────────── */}
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <PemText
            style={{
              fontFamily: fontFamily.sans.medium,
              fontSize: fontSize.lg,
              fontWeight: "500",
              color: chrome.text,
            }}
          >
            Hey {firstName}
          </PemText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings")}
          hitSlop={12}
        >
          {user?.imageUrl ? (
            <Image source={{ uri: user.imageUrl }} style={styles.avatar} />
          ) : (
            <Settings size={22} color={chrome.textMuted} strokeWidth={2} />
          )}
        </Pressable>
      </View>

      {/* ── Tabs: Brief + Dumps only ───────────── */}
      <View style={styles.tabRow}>
        <Chip label="Brief" Icon={Inbox} active={tab === "brief"} chrome={chrome} onPress={() => setTab("brief")} />
        <Chip label="Dumps" active={tab === "dumps"} chrome={chrome} onPress={() => setTab("dumps")} />
      </View>

      {/* ── Brief ──────────────────────────────── */}
      {tab === "brief" && (
        <>
          {loading ? (
            <PemLoadingIndicator placement="pageCenter" />
          ) : err ? (
            <PemText variant="body" style={{ color: chrome.textMuted, padding: space[4] }}>{err}</PemText>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={[styles.scrollContent, { paddingHorizontal: BRIEF_INSET }]}
              refreshControl={<PemRefreshControl refreshing={refreshing} onRefresh={() => void load("pull")} />}
            >
              {/* Date + Statement */}
              <View style={styles.statement}>
                <PemText variant="caption" style={{ color: chrome.textDim, letterSpacing: 1.2, marginBottom: space[2] }}>
                  {dateLine}
                </PemText>
                <PemText style={{
                  fontFamily: fontFamily.display.italic,
                  fontStyle: "italic",
                  fontSize: fontSize.md,
                  fontWeight: "200",
                  color: chrome.text,
                  lineHeight: Math.round(fontSize.md * 1.55),
                }}>
                  {statement}
                </PemText>
              </View>

              {!hasToday && hasAnything && (
                <PemText variant="caption" style={{ color: chrome.textDim, marginBottom: space[3] }}>
                  Nothing for today — see below for this week and lists.
                </PemText>
              )}

              {!hasAnything && batchGroups.length === 0 && somedayItems.length === 0 && (
                <View style={styles.emptyState}>
                  <PemText style={{
                    fontFamily: fontFamily.display.italic,
                    fontStyle: "italic",
                    fontSize: fontSize.xl,
                    fontWeight: "200",
                    color: chrome.text,
                    marginBottom: space[3],
                  }}>
                    All clear.
                  </PemText>
                  <PemText style={{
                    fontFamily: fontFamily.sans.regular,
                    fontSize: fontSize.sm,
                    fontWeight: "300",
                    color: chrome.textDim,
                    textAlign: "center",
                    lineHeight: Math.round(fontSize.sm * 1.7),
                    maxWidth: 240,
                  }}>
                    {"Say or type anything below.\nPem will figure out what to do with it."}
                  </PemText>
                </View>
              )}

              {hasAnything && <Sep chrome={chrome} />}

              {hasOverdue && (
                <>
                  <SectionLabel label="OVERDUE" color="#ff453a" chrome={chrome} />
                  <ItemList items={brief!.overdue} chrome={chrome} onPress={setDetail} />
                  <Sep chrome={chrome} />
                </>
              )}

              {hasToday && (
                <>
                  <SectionLabel label="TODAY" color={chrome.textMuted} chrome={chrome} />
                  <View style={styles.timeline}>
                    {brief!.today.map((item) => {
                      const time = formatTime(item.event_start_at ?? item.due_at);
                      return (
                        <View key={item.id} style={styles.timelineRow}>
                          <View style={styles.timeCol}>
                            {time && (
                              <PemText variant="caption" style={{ color: chrome.textDim, fontVariant: ["tabular-nums"] }}>
                                {time}
                              </PemText>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <GlanceRow item={item} chrome={chrome} onPress={() => setDetail(item)} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  <Sep chrome={chrome} />
                </>
              )}

              {hasTomorrow && (
                <CollapsibleSection label="TOMORROW" count={brief!.tomorrow.length} expanded={tomorrowExpanded} onToggle={() => setTomorrowExpanded((v) => !v)} chrome={chrome}>
                  <ItemList items={brief!.tomorrow} chrome={chrome} onPress={setDetail} />
                </CollapsibleSection>
              )}

              {hasWeek && (
                <CollapsibleSection label="THIS WEEK" count={brief!.this_week.length} expanded={weekExpanded} onToggle={() => setWeekExpanded((v) => !v)} chrome={chrome}>
                  <ItemList items={brief!.this_week} chrome={chrome} onPress={setDetail} />
                </CollapsibleSection>
              )}

              {hasNextWeek && (
                <CollapsibleSection label="NEXT WEEK & LATER" count={brief!.next_week.length} expanded={nextWeekExpanded} onToggle={() => setNextWeekExpanded((v) => !v)} chrome={chrome}>
                  <ItemList items={brief!.next_week} chrome={chrome} onPress={setDetail} />
                </CollapsibleSection>
              )}

              {/* ── Inline batch groups ───────────── */}
              {batchGroups.map(({ batch_key, items }) => (
                <InlineBatch
                  key={batch_key}
                  label={BATCH_LABELS[batch_key] ?? batch_key}
                  items={items}
                  chrome={chrome}
                  defaultExpanded
                  onPress={setDetail}
                />
              ))}

              {/* ── Someday (quiet) ───────────────── */}
              {somedayItems.length > 0 && (
                <InlineBatch
                  label="Someday"
                  items={somedayItems}
                  chrome={chrome}
                  defaultExpanded={false}
                  onPress={setDetail}
                />
              )}

            </ScrollView>
          )}
        </>
      )}

      {/* ── Dumps ──────────────────────────────── */}
      {tab === "dumps" && (
        <DumpsList chrome={chrome} getToken={() => getTokenRef.current()} />
      )}

      <ThinkingPill visible={thinking} chrome={chrome} />

      <InlineVoiceBar
        resolved={resolved}
        onDumpSuccess={() => setDumpSuccess(true)}
        onDumpCreated={(id) => {
          setPendingStreamDumpId(id);
          void load("silent");
        }}
        onPemResponse={(answer, sources) => { setPemAnswer(answer); setPemSources(sources); }}
        onThinking={() => setThinking(true)}
        onThinkingDone={() => setThinking(false)}
        askLocked={thinking}
      />

      <DumpSuccessOverlay visible={dumpSuccess} pageColor={chrome.page} onDone={() => setDumpSuccess(false)} />

      <PemResponseSheet
        visible={pemAnswer != null}
        answer={pemAnswer ?? ""}
        sources={pemSources}
        onDismiss={() => { setPemAnswer(null); setPemSources([]); }}
        pageColor={chrome.page}
        textColor={chrome.text}
        mutedColor={chrome.textMuted}
        borderColor={chrome.border}
      />

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

/* ── Sub-components ──────────────────────────── */

function Chip({
  label,
  Icon,
  active,
  chrome,
  onPress,
}: {
  label: string;
  Icon?: LucideIcon;
  active?: boolean;
  chrome: ReturnType<typeof inboxChrome>;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: !!active }}
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? chrome.text : chrome.surface,
          borderColor: active ? chrome.text : chrome.borderStrong,
        },
      ]}
    >
      {Icon ? <Icon size={14} color={active ? chrome.page : chrome.text} strokeWidth={2} /> : null}
      <PemText variant="caption" style={{ color: active ? chrome.page : chrome.text, fontWeight: active ? "600" : "400" }}>
        {label}
      </PemText>
    </Pressable>
  );
}

function InlineBatch({
  label,
  items,
  chrome,
  onPress,
  defaultExpanded = true,
}: {
  label: string;
  items: ApiExtract[];
  chrome: ReturnType<typeof inboxChrome>;
  onPress: (item: ApiExtract) => void;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={() => setExpanded((v) => !v)} style={styles.batchHeader}>
        <PemText variant="caption" style={{ color: chrome.textDim, letterSpacing: 1.2 }}>
          {label.toUpperCase()} · {items.length}
        </PemText>
        <PemText variant="caption" style={{ color: chrome.textDim }}>
          {expanded ? "▲" : "▼"}
        </PemText>
      </Pressable>
      {expanded && (
        <View style={{ gap: space[2], paddingBottom: space[2] }}>
          {items.map((item) => (
            <GlanceRow key={item.id} item={item} chrome={chrome} onPress={() => onPress(item)} />
          ))}
        </View>
      )}
    </View>
  );
}

function Sep({ chrome }: { chrome: ReturnType<typeof inboxChrome> }) {
  return <View style={[styles.sep, { backgroundColor: chrome.border }]} />;
}

function SectionLabel({ label, color, chrome }: { label: string; color: string; chrome: ReturnType<typeof inboxChrome> }) {
  return (
    <View style={styles.secLabel}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <PemText variant="caption" style={{ color: chrome.textDim, letterSpacing: 1.4 }}>{label}</PemText>
    </View>
  );
}

function CollapsibleSection({ label, count, expanded, onToggle, chrome, children }: { label: string; count: number; expanded: boolean; onToggle: () => void; chrome: ReturnType<typeof inboxChrome>; children: React.ReactNode }) {
  return (
    <View>
      <Pressable accessibilityRole="button" onPress={onToggle} style={styles.collapseHeader}>
        <PemText variant="caption" style={{ color: chrome.textDim, letterSpacing: 1.2 }}>
          {label} · {count}
        </PemText>
        <PemText variant="caption" style={{ color: chrome.textDim }}>
          {expanded ? "▲" : "▼"}
        </PemText>
      </Pressable>
      {expanded && children}
    </View>
  );
}

function ThinkingPill({ visible, chrome }: { visible: boolean; chrome: ReturnType<typeof inboxChrome> }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start();
      return;
    }
    Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.5, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [visible, opacity]);

  if (!visible) return null;

  return (
    <Animated.View style={[styles.thinkingPill, { backgroundColor: chrome.surface, borderColor: chrome.border, opacity }]}>
      <PemText style={{
        fontFamily: fontFamily.display.italic,
        fontStyle: "italic",
        fontSize: fontSize.xs,
        fontWeight: "300",
        color: chrome.textMuted,
      }}>
        pem is thinking…
      </PemText>
    </Animated.View>
  );
}

function ItemList({ items, chrome, onPress }: { items: ApiExtract[]; chrome: ReturnType<typeof inboxChrome>; onPress: (item: ApiExtract) => void }) {
  return (
    <View style={{ gap: space[2], paddingBottom: space[2] }}>
      {items.map((item) => (
        <GlanceRow key={item.id} item={item} chrome={chrome} onPress={() => onPress(item)} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[5],
    paddingBottom: space[2],
  },
  avatar: { width: 32, height: 32, borderRadius: 16 },
  tabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[5],
    paddingBottom: space[3],
  },
  scrollContent: { paddingBottom: 120 },
  statement: { paddingTop: space[2] },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: space[10],
  },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: space[4] },
  secLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: space[2],
  },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  timeline: { gap: space[2], paddingBottom: space[2] },
  timelineRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  timeCol: { width: 54, alignItems: "flex-end" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: 20,
    borderWidth: 1,
  },
  batchHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space[3],
  },
  collapseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space[3],
  },
  thinkingPill: {
    position: "absolute",
    bottom: 100,
    alignSelf: "center",
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    zIndex: 50,
  },
});
