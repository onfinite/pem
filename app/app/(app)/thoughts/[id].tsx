import PemLoadingIndicator from "@/components/ui/PemLoadingIndicator";
import PemText from "@/components/ui/PemText";
import { inboxChrome } from "@/constants/inboxChrome";
import { fontFamily, fontSize, lh, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import {
  batchKeyLabel,
  toneChipLabel,
  urgencyChipLabel,
} from "@/lib/extractLabels";
import VoiceNotePlayer from "@/components/ui/VoiceNotePlayer";
import { pemAmber } from "@/constants/theme";
import {
  getDumpAudioUrl,
  getDumpDetail,
  retryDumpExtraction,
  type ApiExtract,
  type LogEntry,
} from "@/lib/pemApi";
import { useDumpInboxStream } from "@/hooks/useDumpInboxStream";
import { firstParam } from "@/lib/routeParams";
import { useAuth } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  Clock,
  FileText,
  Merge,
  Plus,
  Settings2,
  XCircle,
  Zap,
} from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";

function relTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusLabel(s: string) {
  if (s === "done") return "Done";
  if (s === "dismissed") return "Dismissed";
  if (s === "snoozed") return "Snoozed";
  return "Inbox";
}

function logIcon(log: LogEntry) {
  const p = log.payload as Record<string, unknown> | null;
  const action = (p?.action as string) ?? "";
  if (log.error) return XCircle;
  if (action === "merge" || action === "merged") return Merge;
  if (action === "create" || action === "created") return Plus;
  if (action === "done" || action === "mark_done") return CheckCircle2;
  if (action === "dismiss") return XCircle;
  if (action === "snooze") return Clock;
  if (action === "calendar_write") return Calendar;
  if (log.type === "calendar") return Calendar;
  if (log.is_agent) return Zap;
  return Settings2;
}

export default function ThoughtDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = firstParam(params.id);
  const { resolved } = useTheme();
  const chrome = inboxChrome(resolved);
  const insets = useSafeAreaInsets();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [rawText, setRawText] = useState("");
  const [polished, setPolished] = useState<string | null>(null);
  const [dumpStatus, setDumpStatus] = useState<
    "processing" | "processed" | "failed" | null
  >(null);
  const [extracts, setExtracts] = useState<ApiExtract[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [hasAudio, setHasAudio] = useState(false);
  const [retryingDump, setRetryingDump] = useState(false);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!id) return;
    const silent = opts?.silent ?? false;
    if (!silent) {
      setLoading(true);
      setErr(null);
    }
    try {
      const res = await getDumpDetail(() => getTokenRef.current(), id);
      setRawText(res.dump.raw_text ?? res.dump.text);
      setPolished(res.dump.polished_text ?? null);
      setDumpStatus(res.dump.status);
      setHasAudio(!!res.dump.has_audio);
      setExtracts(res.extracts);
      setLogs(res.logs);
    } catch (e) {
      if (!silent) {
        setErr(e instanceof Error ? e.message : "Couldn't load");
        setDumpStatus(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      setErr("Missing thought");
      return;
    }
    void load();
  }, [load, id]);

  const loadSilentRef = useRef(() => {});
  loadSilentRef.current = () => void load({ silent: true });

  const streamDumpId =
    dumpStatus === "processing" && id ? id : null;
  const { streamDone } = useDumpInboxStream(streamDumpId, {
    onInboxProgress: () => loadSilentRef.current(),
  });

  useEffect(() => {
    if (!streamDone) return;
    void load({ silent: true });
  }, [streamDone, load]);

  const fetchDumpAudio = useCallback(async () => {
    if (!id) throw new Error("Missing dump");
    const res = await getDumpAudioUrl(() => getTokenRef.current(), id);
    return res.url;
  }, [id]);

  const onRetryDump = useCallback(async () => {
    if (!id) return;
    setRetryingDump(true);
    try {
      await retryDumpExtraction(() => getTokenRef.current(), id);
      await load({ silent: true });
    } catch {
      Alert.alert(
        "Couldn't retry",
        "Something went wrong. Try again in a moment.",
      );
    } finally {
      setRetryingDump(false);
    }
  }, [id, load]);

  const badgeColor =
    dumpStatus === "failed"
      ? "#d70015"
      : dumpStatus === "processing"
        ? chrome.textMuted
        : "#4caf50";
  const badgeLabel =
    dumpStatus === "failed"
      ? "Failed"
      : dumpStatus === "processing"
        ? "Processing"
        : "Processed";

  return (
    <View
      style={[styles.root, { backgroundColor: chrome.page, paddingTop: insets.top }]}
    >
      <StatusBar style={resolved === "dark" ? "light" : "dark"} />
      <View style={[styles.header, { borderBottomColor: chrome.border }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={12}>
          <ChevronLeft size={24} color={chrome.text} strokeWidth={2} />
        </Pressable>
        <PemText
          style={{
            marginLeft: space[2],
            flex: 1,
            fontFamily: fontFamily.sans.medium,
            fontSize: fontSize.base,
            fontWeight: "500",
            color: chrome.text,
          }}
        >
          Dump
        </PemText>
        {dumpStatus && (
          <View
            style={[
              styles.badge,
              { backgroundColor: badgeColor + "18", borderColor: badgeColor + "30" },
            ]}
          >
            <PemText
              style={{ fontSize: 10, fontWeight: "600", color: badgeColor, letterSpacing: 0.5 }}
            >
              {badgeLabel}
            </PemText>
          </View>
        )}
      </View>

      {loading ? (
        <PemLoadingIndicator placement="pageCenter" />
      ) : err ? (
        <View style={{ padding: space[5] }}>
          <PemText
            style={{
              fontFamily: fontFamily.sans.regular,
              fontSize: fontSize.sm,
              color: chrome.textMuted,
            }}
          >
            {err}
          </PemText>
        </View>
      ) : (
        <View style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ padding: space[5], paddingBottom: space[10] }}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Error Banner ─────────────────────────── */}
          {dumpStatus === "failed" && (
            <View
              style={[
                styles.card,
                { backgroundColor: chrome.urgentBg, borderColor: chrome.urgentBorder },
              ]}
            >
              <PemText
                style={{
                  fontSize: 10,
                  fontWeight: "600",
                  color: "#d70015",
                  letterSpacing: 1,
                  textTransform: "uppercase",
                  marginBottom: space[1],
                }}
              >
                Couldn’t process
              </PemText>
              <PemText
                style={{
                  fontFamily: fontFamily.sans.regular,
                  fontSize: fontSize.sm,
                  color: chrome.textMuted,
                  lineHeight: lh(fontSize.sm, 1.55),
                }}
              >
                The pipeline didn’t finish. You can try again below.
              </PemText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Retry processing this dump"
                disabled={retryingDump}
                onPress={() => void onRetryDump()}
                style={[
                  styles.retryBtn,
                  {
                    backgroundColor: pemAmber,
                    opacity: retryingDump ? 0.55 : 1,
                  },
                ]}
              >
                {retryingDump ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <PemText
                    style={{
                      fontFamily: fontFamily.sans.semibold,
                      fontSize: fontSize.sm,
                      fontWeight: "600",
                      color: "#fff",
                    }}
                  >
                    Try again
                  </PemText>
                )}
              </Pressable>
            </View>
          )}

          {/* ── What you said ────────────────────────── */}
          <SectionLabel text="What you said" chrome={chrome} />
          <View
            style={[styles.card, { backgroundColor: chrome.surface, borderColor: chrome.border }]}
          >
            <PemText
              style={{
                fontFamily: fontFamily.sans.regular,
                fontSize: fontSize.sm,
                fontWeight: "300",
                fontStyle: "italic",
                color: chrome.textMuted,
                lineHeight: lh(fontSize.sm, 1.65),
              }}
            >
              {rawText}
            </PemText>
            {hasAudio && id && (
              <VoiceNotePlayer
                key={id}
                chrome={chrome}
                fetchUrl={fetchDumpAudio}
              />
            )}
          </View>

          {/* ── Polished version ─────────────────────── */}
          {polished && polished.trim() !== rawText.trim() && (
            <>
              <SectionLabel text="Polished" chrome={chrome} />
              <View
                style={[
                  styles.card,
                  { backgroundColor: chrome.amberSoft, borderColor: chrome.amberBorder },
                ]}
              >
                <PemText
                  style={{
                    fontFamily: fontFamily.sans.regular,
                    fontSize: fontSize.sm,
                    color: chrome.text,
                    lineHeight: lh(fontSize.sm, 1.55),
                  }}
                >
                  {polished}
                </PemText>
              </View>
            </>
          )}

          {/* ── Extracts created ─────────────────────── */}
          {extracts.length > 0 && (
            <>
              <SectionLabel
                text={`${extracts.length} extract${extracts.length > 1 ? "s" : ""} created`}
                chrome={chrome}
              />
              {extracts.map((ext) => {
                const tone = toneChipLabel(ext.tone);
                const batch = batchKeyLabel(ext.batch_key);
                const urg = urgencyChipLabel(ext.urgency);
                return (
                  <View
                    key={ext.id}
                    style={[
                      styles.card,
                      {
                        backgroundColor: chrome.surface,
                        borderColor: chrome.border,
                        marginBottom: space[2],
                      },
                    ]}
                  >
                    <View style={styles.extractHeader}>
                      {ext.source === "calendar" ? (
                        <Calendar size={14} color={chrome.textDim} strokeWidth={1.8} />
                      ) : (
                        <FileText size={14} color={chrome.textDim} strokeWidth={1.8} />
                      )}
                      <PemText
                        style={{
                          flex: 1,
                          marginLeft: space[2],
                          fontSize: fontSize.sm,
                          fontWeight: "500",
                          color: chrome.text,
                        }}
                        numberOfLines={2}
                      >
                        {ext.text}
                      </PemText>
                    </View>
                    <View style={styles.extractMeta}>
                      <Tag label={statusLabel(ext.status)} color={chrome.textDim} chrome={chrome} />
                      {tone ? <Tag label={tone} color={chrome.textDim} chrome={chrome} /> : null}
                      {batch ? <Tag label={batch} color={chrome.textDim} chrome={chrome} /> : null}
                      {urg ? <Tag label={urg} color={chrome.textDim} chrome={chrome} /> : null}
                    </View>
                    {ext.pem_note && (
                      <PemText
                        style={{
                          marginTop: space[1],
                          fontSize: 11,
                          color: chrome.textMuted,
                          fontStyle: "italic",
                        }}
                      >
                        {ext.pem_note}
                      </PemText>
                    )}
                  </View>
                );
              })}
            </>
          )}

          {/* ── Pipeline log ─────────────────────────── */}
          {logs.length > 0 && (
            <>
              <SectionLabel text="Activity log" chrome={chrome} />
              <View
                style={[
                  styles.card,
                  {
                    backgroundColor: chrome.surface,
                    borderColor: chrome.border,
                    paddingVertical: space[2],
                  },
                ]}
              >
                {logs.map((log, idx) => {
                  const Icon = logIcon(log);
                  const iconColor = log.error
                    ? "#d70015"
                    : log.is_agent
                      ? chrome.textMuted
                      : chrome.textDim;
                  const isLast = idx === logs.length - 1;
                  return (
                    <View key={log.id} style={styles.logRow}>
                      <View style={styles.logIconCol}>
                        <Icon size={14} color={iconColor} strokeWidth={1.8} />
                        {!isLast && (
                          <View
                            style={[styles.logLine, { backgroundColor: chrome.border }]}
                          />
                        )}
                      </View>
                      <View style={[styles.logContent, !isLast && { paddingBottom: space[3] }]}>
                        <PemText
                          style={{
                            fontSize: fontSize.xs,
                            color: chrome.text,
                            lineHeight: lh(fontSize.xs, 1.5),
                          }}
                        >
                          {log.pem_note || describeLog(log)}
                        </PemText>
                        {log.error && (
                          <PemText
                            style={{
                              fontSize: 10,
                              color: "#d70015",
                              marginTop: 2,
                            }}
                          >
                            Step failed — details aren’t shown here.
                          </PemText>
                        )}
                        <PemText style={{ fontSize: 10, color: chrome.textDim, marginTop: 2 }}>
                          {relTime(log.created_at)}
                          {log.is_agent ? " · pem" : ""}
                        </PemText>
                      </View>
                    </View>
                  );
                })}
              </View>
            </>
          )}
        </ScrollView>
        {dumpStatus === "processing" ? (
          <View
            style={[styles.processingBanner, { backgroundColor: chrome.surface, borderColor: chrome.border }]}
            pointerEvents="none"
          >
            <ActivityIndicator color={chrome.textMuted} />
            <PemText
              style={{
                marginLeft: space[2],
                fontSize: fontSize.sm,
                color: chrome.textMuted,
              }}
            >
              Still organizing…
            </PemText>
          </View>
        ) : null}
        </View>
      )}
    </View>
  );
}

function SectionLabel({
  text,
  chrome,
}: {
  text: string;
  chrome: ReturnType<typeof inboxChrome>;
}) {
  return (
    <PemText
      style={{
        fontSize: 10,
        fontWeight: "600",
        color: chrome.textDim,
        letterSpacing: 1,
        textTransform: "uppercase",
        marginTop: space[5],
        marginBottom: space[2],
      }}
    >
      {text}
    </PemText>
  );
}

function Tag({
  label,
  color,
  chrome,
}: {
  label: string;
  color: string;
  chrome: ReturnType<typeof inboxChrome>;
}) {
  return (
    <View style={[styles.tag, { backgroundColor: chrome.surfaceMuted, borderColor: chrome.border }]}>
      <PemText style={{ fontSize: 10, color, fontWeight: "500" }}>{label}</PemText>
    </View>
  );
}

function describeLog(log: LogEntry): string {
  const p = log.payload as Record<string, unknown> | null;
  const action = (p?.action as string) ?? "";

  if (log.type === "dump") {
    if (action === "polished") return "Polished your dump text";
    if (action === "extract") return "Extracted items from dump";
    return "Dump processed";
  }
  if (log.type === "extract") {
    if (action === "create" || action === "created") return "Created extract";
    if (action === "merge" || action === "merged") return "Merged with existing task";
    if (action === "done" || action === "mark_done") return "Marked as done";
    if (action === "dismiss") return "Dismissed";
    if (action === "snooze") return "Snoozed";
    if (action === "update") return "Updated extract";
    return "Extract action";
  }
  if (log.type === "calendar") {
    if (action === "calendar_write") return "Added to calendar";
    if (action === "calendar_sync") return "Synced from calendar";
    return "Calendar event";
  }
  return log.type;
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
  badge: {
    paddingHorizontal: space[2],
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    marginBottom: space[3],
  },
  extractHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  extractMeta: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: space[2],
    gap: space[1],
  },
  tag: {
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
  },
  logRow: {
    flexDirection: "row",
    paddingHorizontal: space[2],
  },
  logIconCol: {
    width: 20,
    alignItems: "center",
    paddingTop: 2,
  },
  logLine: {
    width: 1,
    flex: 1,
    marginTop: 4,
  },
  logContent: {
    flex: 1,
    marginLeft: space[2],
  },
  processingBanner: {
    position: "absolute",
    left: space[5],
    right: space[5],
    bottom: space[4],
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: space[3],
    paddingHorizontal: space[3],
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  retryBtn: {
    marginTop: space[3],
    alignSelf: "flex-start",
    paddingVertical: space[2],
    paddingHorizontal: space[4],
    borderRadius: 10,
    minHeight: 40,
    justifyContent: "center",
    alignItems: "center",
  },
});
