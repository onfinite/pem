import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import { CALENDAR_EVENT_DOT_COLOR } from "./constants";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
  CalendarDays,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  List as ListIcon,
  X,
} from "lucide-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Calendar, type DateData } from "react-native-calendars";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DraftSection } from "./DraftSection";
import { reminderIso } from "./taskEditSheet.constants";
import { editSheetStyles as s } from "./taskEditSheet.styles";
import type { TaskEditSheetProps } from "./types";

const DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "Weekend" },
  { key: "next_week", label: "Next Week" },
  { key: "someday", label: "Someday" },
  { key: "no_date", label: "No Date" },
];

const REMINDER_OPTIONS = [
  { key: "none", label: "None" },
  { key: "15min", label: "15 min" },
  { key: "1hour", label: "1 hour" },
  { key: "morning", label: "Morning of" },
];

function buildDatePatch(key: string, pickedDate?: Date): Record<string, unknown> {
  const eod = (d: Date) => { d.setHours(23, 59, 59, 999); return d; };
  const clear = { due_at: null, period_start: null, period_end: null, period_label: null, urgency: "none" };

  if (key === "today") return { ...clear, due_at: eod(new Date()).toISOString() };
  if (key === "tomorrow") { const d = new Date(); d.setDate(d.getDate() + 1); return { ...clear, due_at: eod(d).toISOString() }; }
  if (key === "weekend") {
    const sat = new Date(); sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7)); sat.setHours(0, 0, 0, 0);
    const sun = new Date(sat); sun.setDate(sun.getDate() + 1); eod(sun);
    return { ...clear, period_start: sat.toISOString(), period_end: sun.toISOString(), period_label: "weekend" };
  }
  if (key === "next_week") {
    const mon = new Date(); mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7)); mon.setHours(0, 0, 0, 0);
    const fri = new Date(mon); fri.setDate(fri.getDate() + 4); eod(fri);
    return { ...clear, period_start: mon.toISOString(), period_end: fri.toISOString(), period_label: "next week" };
  }
  if (key === "pick" && pickedDate) return { ...clear, due_at: eod(pickedDate).toISOString() };
  if (key === "someday") return { ...clear, urgency: "someday" };
  return clear;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function primaryDateIso(extract: ApiExtract): string | null {
  return extract.due_at ?? extract.event_start_at ?? extract.scheduled_at ?? extract.period_start ?? null;
}

function formatDateSummary(extract: ApiExtract, datePatch: Record<string, unknown>): string {
  const urgency = (datePatch.urgency as string) ?? extract.urgency;
  const dueAt = datePatch.due_at !== undefined ? datePatch.due_at : extract.due_at;
  const pLabel = datePatch.period_label !== undefined ? datePatch.period_label : extract.period_label;
  const pStart = datePatch.period_start !== undefined ? datePatch.period_start : extract.period_start;
  const eventStart = extract.event_start_at;
  const scheduledAt = extract.scheduled_at;

  if (urgency === "someday") return "Someday";
  if (dueAt) return new Date(dueAt as string).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (eventStart) return new Date(eventStart).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (scheduledAt) return new Date(scheduledAt).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  if (pLabel) return (pLabel as string).charAt(0).toUpperCase() + (pLabel as string).slice(1);
  if (pStart) return "Scheduled";
  return "No date";
}

export function TaskEditSheet({
  visible, extract, lists, onClose, onSave, onDone, onDismiss,
}: TaskEditSheetProps) {
  const { colors, resolved } = useTheme();
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("window").height;
  const sheetH = screenH - insets.top;

  const [text, setText] = useState("");
  const [note, setNote] = useState("");
  const [patch, setPatch] = useState<Record<string, unknown>>({});
  const [listOpen, setListOpen] = useState(false);
  const [dateOpen, setDateOpen] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [reminderKey, setReminderKey] = useState("1hour");
  const [selectedDay, setSelectedDay] = useState(toDateKey(new Date()));

  useEffect(() => {
    if (!extract) return;
    setText(extract.text);
    setNote(extract.pem_note ?? "");
    setPatch({});
    setListOpen(false);
    setDateOpen(false);
    setShowTimePicker(false);
    const anchor = primaryDateIso(extract);
    setSelectedDay(anchor ? toDateKey(new Date(anchor)) : toDateKey(new Date()));
  }, [extract]);

  const mergePatch = useCallback((partial: Record<string, unknown>) => {
    setPatch((prev) => ({ ...prev, ...partial }));
  }, []);

  const handleSave = useCallback(() => {
    if (!extract) return;
    const full: Record<string, unknown> = { ...patch };
    if (text.trim() && text !== extract.text) full.text = text.trim();
    if (note !== (extract.pem_note ?? "")) full.pem_note = note || null;
    if (Object.keys(full).length > 0) onSave(extract.id, full);
    onClose();
  }, [extract, patch, text, note, onSave, onClose]);

  const handleDone = useCallback(() => {
    if (extract) onDone(extract.id);
  }, [extract, onDone]);

  const handleDismiss = useCallback(() => {
    if (!extract) return;
    Alert.alert("Dismiss", "Are you sure you want to dismiss this?", [
      { text: "Cancel", style: "cancel" },
      { text: "Dismiss", style: "destructive", onPress: () => onDismiss(extract.id) },
    ]);
  }, [extract, onDismiss]);

  const handlePreset = useCallback((key: string) => {
    mergePatch(buildDatePatch(key));
  }, [mergePatch]);

  const handleDayPress = useCallback((day: DateData) => {
    setSelectedDay(day.dateString);
    mergePatch(buildDatePatch("pick", new Date(day.dateString + "T12:00:00")));
  }, [mergePatch]);

  const handleTimePicked = useCallback((_: unknown, date?: Date) => {
    if (Platform.OS === "android") setShowTimePicker(false);
    if (date) mergePatch(buildDatePatch("pick", date));
  }, [mergePatch]);

  const handleReminder = useCallback((key: string) => {
    setReminderKey(key);
    const anchor = extract?.event_start_at ?? extract?.due_at ?? null;
    mergePatch({ reminder_at: reminderIso(key, anchor) });
  }, [extract, mergePatch]);

  const activeListId = (patch.list_id !== undefined ? patch.list_id : extract?.list_id) as string | null;
  const listName = useMemo(() => {
    if (!activeListId) return "No list";
    return lists.find((l) => l.id === activeListId)?.name ?? "No list";
  }, [activeListId, lists]);

  const calendarTheme = useMemo(() => ({
    calendarBackground: "transparent",
    todayTextColor: pemAmber,
    selectedDayBackgroundColor: pemAmber,
    selectedDayTextColor: "#ffffff",
    dayTextColor: colors.textPrimary,
    textDisabledColor: colors.textTertiary + "55",
    monthTextColor: colors.textPrimary,
    arrowColor: pemAmber,
    textDayFontFamily: fontFamily.sans.regular,
    textMonthFontFamily: fontFamily.display.semibold,
    textDayHeaderFontFamily: fontFamily.sans.medium,
    textDayFontSize: 14,
    textMonthFontSize: 16,
    textDayHeaderFontSize: 12,
  }), [colors]);

  const markedDates = useMemo(() => ({
    [selectedDay]: { selected: true, selectedColor: pemAmber },
  }), [selectedDay]);

  if (!visible || !extract) return null;

  const isSyncedFromCalendar = extract.source === "calendar" && !!extract.external_event_id;
  const isInvite = isSyncedFromCalendar && !extract.is_organizer;
  const isCalendarEvent = extract.source === "calendar" || !!extract.external_event_id;
  const isIdea = extract.tone === "idea";
  const canComplete = !isIdea && !isCalendarEvent;
  const isDone = extract.status === "done";
  const dateSummary = formatDateSummary(extract, patch);
  const ListChevron = listOpen ? ChevronUp : ChevronDown;
  const DateChevron = dateOpen ? ChevronUp : ChevronDown;

  return (
    <Modal transparent visible animationType="slide" onRequestClose={onClose}>
      <View style={s.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={[s.sheet, { height: sheetH, backgroundColor: colors.cardBackground, paddingBottom: insets.bottom + 8 }]}>
          <View style={local.topBar}>
            <View style={{ flex: 1 }} />
            <Pressable
              onPress={onClose}
              style={[local.closeBtn, { backgroundColor: colors.secondarySurface }]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={18} color={colors.textSecondary} strokeWidth={2.5} />
            </Pressable>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: space[4] }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {/* Title */}
            <View style={local.titleRow}>
              {isCalendarEvent ? (
                <View style={local.calendarIcon}>
                  <CalendarDays size={20} color={CALENDAR_EVENT_DOT_COLOR} />
                </View>
              ) : canComplete ? (
                <Pressable
                  onPress={handleDone}
                  style={[local.circle, { borderColor: isDone ? pemAmber : colors.textTertiary, backgroundColor: isDone ? pemAmber : "transparent" }]}
                >
                  {isDone && <Text style={local.checkmark}>✓</Text>}
                </Pressable>
              ) : null}
              <TextInput
                style={[local.titleInput, { color: colors.textPrimary }]}
                value={text}
                onChangeText={setText}
                placeholder="Task title"
                placeholderTextColor={colors.placeholder}
                multiline
              />
            </View>

            {/* Date row — collapsible */}
            <Pressable
              style={[local.infoRow, { borderColor: dateOpen ? "transparent" : colors.borderMuted }]}
              onPress={() => setDateOpen((p) => !p)}
            >
              <CalendarDays size={18} color={colors.textSecondary} />
              <Text style={[local.infoText, { color: colors.textPrimary }]}>{dateSummary}</Text>
              <DateChevron size={16} color={colors.textTertiary} />
            </Pressable>

            {dateOpen && (
              <View style={[local.dateSection, { borderColor: colors.borderMuted }]}>
                <View style={local.presetGrid}>
                  {DATE_PRESETS.map((p) => (
                    <Pressable
                      key={p.key}
                      onPress={() => handlePreset(p.key)}
                      style={[local.preset, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}
                    >
                      <Text style={[local.presetText, { color: colors.textPrimary }]}>{p.label}</Text>
                    </Pressable>
                  ))}
                </View>

                <View style={local.calendarWrap}>
                  <Calendar
                    current={selectedDay}
                    markedDates={markedDates}
                    onDayPress={handleDayPress}
                    minDate={toDateKey(new Date())}
                    theme={calendarTheme}
                    style={local.calendar}
                  />
                </View>

                <Pressable
                  style={[local.timeRow, { borderColor: colors.borderMuted }]}
                  onPress={() => setShowTimePicker(!showTimePicker)}
                >
                  <Clock size={18} color={colors.textSecondary} />
                  <Text style={[local.timeRowText, { color: colors.textPrimary }]}>
                    {showTimePicker ? "Hide time" : "Add time"}
                  </Text>
                </Pressable>

                {showTimePicker && (
                  <DateTimePicker
                    value={primaryDateIso(extract) ? new Date(primaryDateIso(extract)!) : new Date()}
                    mode="time"
                    display="spinner"
                    themeVariant={resolved}
                    onChange={handleTimePicked}
                  />
                )}

                <Text style={[local.sectionSubLabel, { color: colors.textTertiary }]}>Reminder</Text>
                <View style={local.presetGrid}>
                  {REMINDER_OPTIONS.map((r) => (
                    <Pressable
                      key={r.key}
                      onPress={() => handleReminder(r.key)}
                      style={[
                        local.preset,
                        {
                          backgroundColor: reminderKey === r.key ? pemAmber : colors.secondarySurface,
                          borderColor: reminderKey === r.key ? pemAmber : colors.borderMuted,
                        },
                      ]}
                    >
                      <Text style={[local.presetText, { color: reminderKey === r.key ? "#fff" : colors.textPrimary }]}>{r.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            )}

            {/* List picker — inline dropdown */}
            <Pressable
              style={[local.infoRow, { borderColor: listOpen ? "transparent" : colors.borderMuted }]}
              onPress={() => setListOpen((p) => !p)}
            >
              <ListIcon size={18} color={colors.textSecondary} />
              <Text style={[local.infoText, { color: colors.textPrimary }]}>{listName}</Text>
              <ListChevron size={16} color={colors.textTertiary} />
            </Pressable>
            {listOpen && (
              <View style={[local.dropdown, { borderColor: colors.borderMuted }]}>
                <Pressable style={local.dropdownItem} onPress={() => { mergePatch({ list_id: null }); setListOpen(false); }}>
                  <Text style={[local.dropdownText, { color: colors.textPrimary }]}>No list</Text>
                  {!activeListId && <Check size={16} color={pemAmber} />}
                </Pressable>
                {lists.map((l) => (
                  <Pressable key={l.id} style={local.dropdownItem} onPress={() => { mergePatch({ list_id: l.id }); setListOpen(false); }}>
                    <Text style={[local.dropdownText, { color: colors.textPrimary }]}>{l.name}</Text>
                    {activeListId === l.id && <Check size={16} color={pemAmber} />}
                  </Pressable>
                ))}
              </View>
            )}

            {/* Note */}
            <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>Note</Text>
            <TextInput
              style={[s.noteInput, { color: colors.textPrimary }]}
              value={note}
              onChangeText={setNote}
              placeholder="Add a note..."
              placeholderTextColor={colors.placeholder}
              multiline
              numberOfLines={3}
            />

            <DraftSection extract={extract} />

            {isSyncedFromCalendar && (
              <View style={[s.banner, { backgroundColor: colors.secondarySurface }]}>
                <Text style={[s.bannerText, { color: colors.textTertiary }]}>
                  {isInvite ? "You were invited to this event" : "Synced from your calendar"}
                </Text>
              </View>
            )}
          </ScrollView>

          <View style={[local.bottomBar, { borderTopColor: colors.borderMuted }]}>
            <Pressable onPress={handleSave} style={[local.saveBtn, { backgroundColor: pemAmber }]}>
              <Text style={local.saveBtnText}>Save</Text>
            </Pressable>
            <Pressable onPress={handleDismiss} hitSlop={8}>
              <Text style={[local.dismissText, { color: colors.textTertiary }]}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const local = StyleSheet.create({
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: space[4],
    paddingTop: space[3],
    paddingBottom: space[1],
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingTop: space[2],
  },
  circle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  calendarIcon: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 4,
  },
  checkmark: { color: "#fff", fontSize: 14, fontWeight: "700" },
  titleInput: {
    flex: 1,
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.lg,
    paddingVertical: 0,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[4],
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  infoText: {
    flex: 1,
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
  },
  dateSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: space[4],
  },
  presetGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: space[3],
  },
  preset: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  presetText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
  calendarWrap: {
    marginBottom: space[2],
  },
  calendar: { borderRadius: radii.md },
  timeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: space[2],
  },
  timeRowText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
  },
  sectionSubLabel: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.xs,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginTop: space[2],
    marginBottom: space[2],
  },
  dropdown: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: space[2],
    marginBottom: space[1],
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingLeft: space[8],
    paddingRight: space[1],
  },
  dropdownText: {
    fontFamily: fontFamily.sans.regular,
    fontSize: fontSize.base,
  },
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[4],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: radii.md,
  },
  saveBtnText: {
    fontFamily: fontFamily.sans.semibold,
    fontSize: fontSize.base,
    color: "#fff",
  },
  dismissText: {
    fontFamily: fontFamily.sans.medium,
    fontSize: fontSize.sm,
  },
});
