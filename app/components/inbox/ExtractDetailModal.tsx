import PemButton from "@/components/ui/PemButton";
import PemText from "@/components/ui/PemText";
import type { InboxChrome } from "@/constants/inboxChrome";
import { fontSize, space } from "@/constants/typography";
import {
  generateExtractDraft,
  getExtractHistory,
  patchExtractReschedule,
  patchExtractSnooze,
  reportExtract,
  type ApiExtract,
  type LogEntry,
  type RescheduleTarget,
} from "@/lib/pemApi";
import * as Clipboard from "expo-clipboard";
import { pemImpactLight, pemNotificationSuccess } from "@/lib/pemHaptics";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
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

const MOVE_OPTIONS: { label: string; target: RescheduleTarget }[] = [
  { label: "Today", target: "today" },
  { label: "This week", target: "this_week" },
  { label: "Next week", target: "next_week" },
  { label: "Someday", target: "someday" },
];

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
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [draft, setDraft] = useState<string | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [snoozeOpen, setSnoozeOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportText, setReportText] = useState("");

  useEffect(() => {
    if (!visible || !item) {
      setLogs([]);
      setDraft(null);
      setSnoozeOpen(false);
      setMoveOpen(false);
      setReportOpen(false);
      setReportText("");
      return;
    }
    getExtractHistory(getToken, item.id)
      .then((r) => setLogs(r.logs))
      .catch(() => {});
    if (item.draft_text) setDraft(item.draft_text);
  }, [visible, item, getToken]);

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

  const handleMove = useCallback(
    async (target: RescheduleTarget) => {
      if (!item) return;
      pemImpactLight();
      try {
        const r = await patchExtractReschedule(getToken, item.id, target);
        pemNotificationSuccess();
        onItemUpdated?.(r.item);
        setMoveOpen(false);
        onClose();
      } catch {
        /* ignore */
      }
    },
    [item, getToken, onClose, onItemUpdated],
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

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button" />
        <View
          style={[styles.sheet, { backgroundColor: chrome.surface, paddingBottom: insets.bottom + space[4] }]}
        >
          <View style={[styles.handle, { backgroundColor: chrome.borderStrong }]} />

          <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
            {/* Title + meta */}
            <PemText variant="title" style={{ color: chrome.text, marginBottom: space[2] }}>
              {item.text}
            </PemText>
            <PemText variant="caption" style={{ color: chrome.textDim, marginBottom: space[3] }}>
              {item.tone} · {item.urgency}
            </PemText>

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

            {/* History timeline */}
            {logs.length > 0 ? (
              <View style={{ marginTop: space[5] }}>
                <PemText variant="caption" style={{ color: chrome.textDim, letterSpacing: 1, marginBottom: space[2] }}>
                  HISTORY
                </PemText>
                {logs.map((log) => (
                  <View key={log.id} style={styles.logRow}>
                    <PemText variant="caption" style={{ color: chrome.textMuted }}>
                      {log.is_agent ? "🤖" : "👤"}{" "}
                      {log.pem_note ?? log.type} — {fmtShort(log.created_at)}
                    </PemText>
                  </View>
                ))}
              </View>
            ) : null}
          </ScrollView>

          {/* Actions */}
          <View style={[styles.actions, { borderTopColor: chrome.border }]}>
            {reportOpen ? (
              <View style={{ gap: space[2], marginBottom: space[2] }}>
                <PemText variant="caption" style={{ color: chrome.textDim }}>
                  {"What's wrong with this item?"}
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
            ) : moveOpen ? (
              <View style={{ gap: space[1], marginBottom: space[2] }}>
                {MOVE_OPTIONS.map((o) => (
                  <Pressable
                    key={o.target}
                    accessibilityRole="button"
                    onPress={() => handleMove(o.target)}
                    style={[styles.snoozeRow, { backgroundColor: chrome.page }]}
                  >
                    <PemText variant="body" style={{ color: chrome.text, fontSize: fontSize.sm }}>
                      {o.label}
                    </PemText>
                  </Pressable>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setMoveOpen(false)}
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
                <View style={{ height: space[2] }} />
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setReportOpen(true)}
                  style={{ paddingVertical: space[3] }}
                >
                  <PemText variant="bodyMuted" style={{ textAlign: "center" }}>Report issue</PemText>
                </Pressable>
              </>
            ) : (
              <>
                <PemButton onPress={onDone}>I handled it</PemButton>
                <View style={{ height: space[2] }} />
                <PemButton variant="secondary" onPress={onDismiss}>
                  Dismiss
                </PemButton>
                <View style={{ height: space[2] }} />
                <View style={styles.linkRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSnoozeOpen(true)}
                    style={{ paddingVertical: space[3] }}
                  >
                    <PemText variant="bodyMuted" style={{ textAlign: "center" }}>Later</PemText>
                  </Pressable>
                  <PemText variant="bodyMuted" style={{ color: chrome.textDim }}> · </PemText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setMoveOpen(true)}
                    style={{ paddingVertical: space[3] }}
                  >
                    <PemText variant="bodyMuted" style={{ textAlign: "center" }}>Move to</PemText>
                  </Pressable>
                  <PemText variant="bodyMuted" style={{ color: chrome.textDim }}> · </PemText>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setReportOpen(true)}
                    style={{ paddingVertical: space[3] }}
                  >
                    <PemText variant="bodyMuted" style={{ textAlign: "center" }}>Report</PemText>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </View>
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { maxHeight: "85%", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: space[2] },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: space[3] },
  scroll: { paddingHorizontal: space[5] },
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
  actions: { paddingHorizontal: space[5], paddingTop: space[3], borderTopWidth: StyleSheet.hairlineWidth },
  draftActions: { flexDirection: "row", gap: space[2], marginTop: space[2] },
  logRow: { paddingVertical: space[1] },
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
