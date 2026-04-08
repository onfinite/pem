import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { fontSize, space } from "@/constants/typography";
import {
  batchKeyLabel,
  toneChipLabel,
  urgencyChipLabel,
} from "@/lib/extractLabels";
import {
  generateExtractDraft,
  getExtractHistory,
  patchExtractSnooze,
  reportExtract,
  type ApiExtract,
  type LogEntry,
} from "@/lib/pemApi";
import * as Clipboard from "expo-clipboard";
import { pemImpactLight, pemNotificationSuccess } from "@/lib/pemHaptics";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { Calendar } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  visible: boolean;
  item: ApiExtract | null;
  chrome: InboxChrome;
  onClose: () => void;
  onDone: () => void;
  onDismiss: () => void;
  onUndone?: () => void;
  onItemUpdated?: (updated: ApiExtract) => void;
  getToken: () => Promise<string | null>;
};

function openInCalendar(item: ApiExtract) {
  if (item.event_start_at) {
    const epoch = Math.floor(new Date(item.event_start_at).getTime() / 1000);
    Linking.openURL(`calshow:${epoch}`).catch(() => {
      Linking.openURL("calshow://").catch(() => {});
    });
    return;
  }
  Linking.openURL("calshow://").catch(() => {});
}

const SNOOZE_OPTIONS = [
  { label: "Later today", until: "later_today" },
  { label: "Tomorrow", until: "tomorrow" },
  { label: "Weekend", until: "weekend" },
  { label: "Next week", until: "next_week" },
  { label: "Someday", until: "someday" },
] as const;

export default function ExtractDetailModal({
  visible,
  item,
  chrome,
  onClose,
  onDone,
  onDismiss,
  onUndone,
  onItemUpdated,
  getToken,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  /** Fixed sheet height so the drawer does not jump when content changes. */
  const sheetHeight = Math.round(windowHeight * 0.78);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);

  const sheetTranslateY = useRef(new Animated.Value(0)).current;
  const dragOrigin = useRef(0);
  const sheetHeightRef = useRef(sheetHeight);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  sheetHeightRef.current = sheetHeight;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx) * 1.2,
      onPanResponderGrant: () => {
        sheetTranslateY.stopAnimation((v) => {
          dragOrigin.current = v;
        });
      },
      onPanResponderMove: (_, g) => {
        const y = dragOrigin.current + g.dy;
        sheetTranslateY.setValue(y > 0 ? y : y * 0.2);
      },
      onPanResponderRelease: (_, g) => {
        const h = sheetHeightRef.current;
        const threshold = Math.max(100, h * 0.14);
        sheetTranslateY.stopAnimation((currentY) => {
          const fastDown = typeof g.vy === "number" && g.vy > 650;
          if (currentY > threshold || fastDown) {
            Animated.timing(sheetTranslateY, {
              toValue: h + 80,
              duration: 260,
              useNativeDriver: true,
            }).start(({ finished }) => {
              if (finished) onCloseRef.current();
            });
          } else {
            Animated.spring(sheetTranslateY, {
              toValue: 0,
              useNativeDriver: true,
              friction: 7,
              tension: 72,
            }).start();
          }
        });
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) {
      sheetTranslateY.setValue(0);
    }
  }, [visible, sheetTranslateY]);

  useEffect(() => {
    if (!visible || !item) {
      setLogs([]);
      setDraft(null);
      setSnoozeOpen(false);
      setReportOpen(false);
      setReportText("");
      setMoreOpen(false);
      setHistoryOpen(false);
      setHistoryLoading(false);
      setHistoryLoaded(false);
      return;
    }
    setHistoryOpen(false);
    setHistoryLoaded(false);
    setLogs([]);
    setHistoryLoading(false);
    if (item.draft_text) setDraft(item.draft_text);
  }, [visible, item?.id, getToken]);

  const loadHistory = useCallback(() => {
    if (!item || historyLoaded || historyLoading) return;
    setHistoryLoading(true);
    getExtractHistory(getToken, item.id)
      .then((r) => {
        setLogs(r.logs);
        setHistoryLoaded(true);
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [item, getToken, historyLoaded, historyLoading]);

  const toggleHistory = useCallback(() => {
    pemImpactLight();
    if (historyOpen) {
      setHistoryOpen(false);
      return;
    }
    setHistoryOpen(true);
    void loadHistory();
  }, [historyOpen, loadHistory]);

  const handleDraft = useCallback(async () => {
    if (!item) return;
    setDraftLoading(true);
    try {
      const r = await generateExtractDraft(getToken, item.id);
      setDraft(r.draft);
      onItemUpdated?.({ ...item, draft_text: r.draft });
    } catch {
      /* ignore */
    } finally {
      setDraftLoading(false);
    }
  }, [item, getToken, onItemUpdated]);

  const handleSnooze = useCallback(
    async (until: string) => {
      if (!item) return;
      pemImpactLight();
      try {
        await patchExtractSnooze(getToken, item.id, until);
        pemNotificationSuccess();
        setSnoozeOpen(false);
        onClose();
      } catch {
        /* ignore */
      }
    },
    [item, getToken, onClose],
  );

  const handleReport = useCallback(async () => {
    if (!item || !reportText.trim()) return;
    pemImpactLight();
    try {
      await reportExtract(getToken, item.id, reportText.trim());
      pemNotificationSuccess();
      Alert.alert("Reported", "Thanks — we'll use this to improve.");
      setReportOpen(false);
      setReportText("");
    } catch {
      Alert.alert("Couldn't report", "Please try again.");
    }
  }, [item, reportText, getToken]);

  const isDone = item?.status === "done";

  if (!item) return null;

  const hasCalendar = !!item.event_start_at;
  const showDraftButton = item.batch_key === "follow_ups" && !draft;

  const toneL = toneChipLabel(item.tone);
  const urgencyL = urgencyChipLabel(item.urgency);
  const batchL = batchKeyLabel(item.batch_key);
  const metaChipLabels = [...new Set([toneL, urgencyL, batchL].filter(Boolean))] as string[];

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.kav}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
        >
        <Animated.View
          style={[
            styles.sheet,
            {
              height: sheetHeight,
              backgroundColor: chrome.surface,
              transform: [{ translateY: sheetTranslateY }],
            },
          ]}
        >
          <View
            style={styles.dragHandleZone}
            accessibilityRole="button"
            accessibilityLabel="Drag down to close"
            {...panResponder.panHandlers}
          >
            <View style={[styles.handle, { backgroundColor: chrome.borderStrong }]} />
          </View>

          <View style={styles.sheetBody}>
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
            {/* Title + meta */}
            <PemText variant="title" style={{ color: chrome.text, marginBottom: space[2] }}>
              {item.text}
            </PemText>
            {metaChipLabels.length > 0 ? (
              <View style={[styles.metaChips, { marginBottom: space[3] }]}>
                {metaChipLabels.map((label) => (
                  <View
                    key={label}
                    style={[styles.metaChip, { borderColor: chrome.border, backgroundColor: chrome.page }]}
                  >
                    <PemText variant="caption" style={{ color: chrome.textMuted, fontSize: fontSize.xs }}>
                      {label}
                    </PemText>
                  </View>
                ))}
              </View>
            ) : null}

            {/* Calendar event info */}
            {hasCalendar ? (
              <View style={[styles.calRow, { backgroundColor: chrome.page, borderColor: chrome.border }]}>
                <PemText variant="caption" style={{ color: chrome.textMuted }}>
                  📅 {fmtRange(item.event_start_at!, item.event_end_at)}
                </PemText>
                {item.event_location ? (
                  <PemText variant="caption" style={{ color: chrome.textMuted, marginTop: 2 }}>
                    📍 {item.event_location}
                  </PemText>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openInCalendar(item)}
                  style={[styles.calButton, { borderColor: chrome.border }]}
                >
                  <Calendar size={14} color={chrome.textMuted} strokeWidth={1.8} />
                  <PemText variant="caption" style={{ color: chrome.text, marginLeft: 6 }}>
                    Open in Calendar
                  </PemText>
                </Pressable>
              </View>
            ) : null}

            {/* Original text */}
            {item.original_text ? (
              <View style={[styles.quote, { borderColor: chrome.border, backgroundColor: chrome.page }]}>
                <PemText variant="bodyMuted" style={{ color: chrome.textMuted, fontStyle: "italic" }}>
                  {item.original_text}
                </PemText>
              </View>
            ) : null}

            {/* Pem note */}
            {item.pem_note ? (
              <View style={{ marginTop: space[4] }}>
                <PemText variant="caption" style={{ color: chrome.textDim, letterSpacing: 1, marginBottom: space[2] }}>
                  PEM
                </PemText>
                <PemText variant="bodyMuted" style={{ color: chrome.textMuted, lineHeight: 24 }}>
                  {item.pem_note}
                </PemText>
              </View>
            ) : null}

            {/* Draft section */}
            {showDraftButton ? (
              <View style={{ marginTop: space[4] }}>
                <PemButton
                  variant="secondary"
                  size="sm"
                  onPress={handleDraft}
                  disabled={draftLoading}
                >
                  {draftLoading ? "Drafting…" : "Draft it"}
                </PemButton>
                {draftLoading ? <ActivityIndicator style={{ marginTop: space[2] }} color={chrome.textMuted} /> : null}
              </View>
            ) : null}

            {draft ? (
              <View style={{ marginTop: space[4] }}>
                <PemText variant="caption" style={{ marginBottom: space[1] }}>
                  Draft
                </PemText>
                <PemText variant="body" style={{ color: chrome.text, fontSize: fontSize.sm, lineHeight: 22 }}>
                  {draft}
                </PemText>
                <View style={styles.draftActions}>
                  <PemButton
                    variant="ghost"
                    size="sm"
                    onPress={() => { pemImpactLight(); Clipboard.setStringAsync(draft); }}
                  >
                    Copy
                  </PemButton>
                  <PemButton
                    variant="ghost"
                    size="sm"
                    onPress={() => Share.share({ message: draft })}
                  >
                    Share
                  </PemButton>
                </View>
              </View>
            ) : null}

            {/* Activity / history — opt-in */}
            <View style={{ marginTop: space[5] }}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: historyOpen }}
                accessibilityLabel={historyOpen ? "Hide activity" : "View activity"}
                onPress={toggleHistory}
                style={styles.historyToggle}
              >
                <PemText variant="caption" style={{ color: chrome.textDim, letterSpacing: 1 }}>
                  {historyOpen ? "Hide activity" : "View activity"}
                </PemText>
                <PemText variant="caption" style={{ color: chrome.textDim }}>
                  {historyOpen ? "▲" : "▼"}
                </PemText>
              </Pressable>
              {historyOpen ? (
                historyLoading ? (
                  <ActivityIndicator style={{ marginTop: space[3] }} color={chrome.textMuted} />
                ) : logs.length > 0 ? (
                  <View style={{ marginTop: space[2] }}>
                    {logs.map((log) => (
                      <View key={log.id} style={styles.logRow}>
                        <PemText variant="caption" style={{ color: chrome.textMuted }}>
                          {log.is_agent ? "🤖" : "👤"}{" "}
                          {log.pem_note ?? log.type} — {fmtShort(log.created_at)}
                        </PemText>
                      </View>
                    ))}
                  </View>
                ) : (
                  <PemText variant="caption" style={{ color: chrome.textDim, marginTop: space[2] }}>
                    No activity logged for this item yet.
                  </PemText>
                )
              ) : null}
            </View>
            </ScrollView>
          </View>

          {/* Actions */}
          <View
            style={[
              styles.actions,
              {
                borderTopColor: chrome.border,
                paddingBottom: insets.bottom + space[4],
              },
            ]}
          >
            {reportOpen ? (
              <View style={{ gap: space[2], marginBottom: space[2] }}>
                <PemText variant="caption" style={{ color: chrome.textDim }}>
                  {"What's wrong with this item?"}
                </PemText>
                <PemText variant="caption" style={{ color: chrome.textDim, opacity: 0.85 }}>
                  We save a snapshot of this item and your source dump for review, and show it in activity.
                </PemText>
                <TextInput
                  value={reportText}
                  onChangeText={setReportText}
                  placeholder="e.g. wrong classification, duplicate, bad text..."
                  placeholderTextColor={chrome.textDim}
                  multiline
                  style={[styles.reportInput, { color: chrome.text, borderColor: chrome.border, backgroundColor: chrome.page }]}
                />
                <PemButton onPress={handleReport} disabled={!reportText.trim()}>
                  Submit report
                </PemButton>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { setReportOpen(false); setReportText(""); }}
                  style={{ paddingVertical: space[2] }}
                >
                  <PemText variant="bodyMuted" style={{ textAlign: "center" }}>Cancel</PemText>
                </Pressable>
              </View>
            ) : snoozeOpen ? (
              <View style={{ gap: space[1], marginBottom: space[2] }}>
                {SNOOZE_OPTIONS.map((o) => (
                  <Pressable
                    key={o.until}
                    accessibilityRole="button"
                    onPress={() => handleSnooze(o.until)}
                    style={[styles.snoozeRow, { backgroundColor: chrome.page }]}
                  >
                    <PemText variant="body" style={{ color: chrome.text, fontSize: fontSize.sm }}>
                      {o.label}
                    </PemText>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setSnoozeOpen(false)}
                  style={{ paddingVertical: space[2] }}
                >
                  <PemText variant="bodyMuted" style={{ textAlign: "center" }}>Cancel</PemText>
                </Pressable>
              </View>
            ) : isDone ? (
              <>
                {onUndone && (
                  <PemButton variant="secondary" onPress={onUndone}>
                    Undo done
                  </PemButton>
                )}
                <View style={styles.linkRow}>
                  <Pressable accessibilityRole="button" onPress={() => setReportOpen(true)} style={{ paddingVertical: space[3] }}>
                    <PemText variant="bodyMuted" style={{ textAlign: "center" }}>Report issue</PemText>
                  </Pressable>
                </View>
              </>
            ) : moreOpen ? (
              <View style={{ gap: space[1], marginBottom: space[2] }}>
                <Pressable accessibilityRole="button" onPress={() => { setMoreOpen(false); onDismiss(); }} style={[styles.snoozeRow, { backgroundColor: chrome.page }]}>
                  <PemText variant="body" style={{ color: chrome.text, fontSize: fontSize.sm }}>Dismiss</PemText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { setMoreOpen(false); setSnoozeOpen(true); }} style={[styles.snoozeRow, { backgroundColor: chrome.page }]}>
                  <PemText variant="body" style={{ color: chrome.text, fontSize: fontSize.sm }}>Move to</PemText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => { setMoreOpen(false); setReportOpen(true); }} style={[styles.snoozeRow, { backgroundColor: chrome.page }]}>
                  <PemText variant="body" style={{ color: chrome.text, fontSize: fontSize.sm }}>Report issue</PemText>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setMoreOpen(false)} style={{ paddingVertical: space[2] }}>
                  <PemText variant="bodyMuted" style={{ textAlign: "center" }}>Cancel</PemText>
                </Pressable>
              </View>
            ) : (
              <>
                <PemButton onPress={onDone}>Handled</PemButton>
                <View style={styles.linkRow}>
                  <Pressable accessibilityRole="button" onPress={() => setMoreOpen(true)} style={{ paddingVertical: space[3] }}>
                    <PemText variant="bodyMuted" style={{ textAlign: "center" }}>More options…</PemText>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function fmtShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtRange(start: string, end: string | null): string {
  const s = fmtShort(start);
  if (!end) return s;
  const e = new Date(end).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return `${s} – ${e}`;
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  kav: { width: "100%", maxHeight: "100%" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    flexDirection: "column",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  dragHandleZone: {
    width: "100%",
    paddingTop: space[2],
    paddingBottom: space[3],
    alignItems: "center",
    justifyContent: "center",
    minHeight: 44,
  },
  sheetBody: {
    flex: 1,
    minHeight: 0,
  },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center" },
  scroll: {
    flex: 1,
    paddingHorizontal: space[5],
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: space[4],
  },
  quote: { borderWidth: 1, borderRadius: 10, padding: space[3] },
  calRow: { borderWidth: 1, borderRadius: 10, padding: space[3], marginBottom: space[3] },
  calButton: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    marginTop: space[2],
    paddingVertical: space[1],
    paddingHorizontal: space[2],
    borderRadius: 6,
    borderWidth: 1,
  },
  actions: {
    flexShrink: 0,
    paddingHorizontal: space[5],
    paddingTop: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  draftActions: { flexDirection: "row", gap: space[2], marginTop: space[2] },
  logRow: { paddingVertical: space[1] },
  historyToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: space[2],
  },
  metaChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: space[2],
    alignItems: "center",
  },
  metaChip: {
    paddingHorizontal: space[3],
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  snoozeRow: { paddingVertical: space[2], paddingHorizontal: space[3], borderRadius: 8 },
  linkRow: { flexDirection: "row", justifyContent: "center", alignItems: "center" },
  reportInput: {
    minHeight: 64,
    borderWidth: 1,
    borderRadius: 10,
    padding: space[3],
    fontSize: fontSize.sm,
    textAlignVertical: "top",
  },
});
