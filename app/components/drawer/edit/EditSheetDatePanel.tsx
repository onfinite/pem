import { pemAmber } from "@/constants/theme";
import { fontFamily, fontSize, radii, space } from "@/constants/typography";
import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/services/api/pemApi";
import DateTimePicker from "@react-native-community/datetimepicker";
import { ArrowLeft, Clock } from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Calendar, type DateData } from "react-native-calendars";
import { reminderIso } from "@/components/drawer/edit/taskEditSheet.constants";

const DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "This Weekend" },
  { key: "next_week", label: "Next Week" },
  { key: "holding", label: "Holding" },
  { key: "no_date", label: "No Date" },
];

const REMINDER_OPTIONS = [
  { key: "none", label: "None" },
  { key: "15min", label: "15 min before" },
  { key: "1hour", label: "1 hour before" },
  { key: "morning", label: "Morning of" },
];

interface EditSheetDatePanelProps {
  extract: ApiExtract;
  onSave: (patch: Record<string, unknown>) => void;
  onBack: () => void;
}

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
  if (key === "holding") return { ...clear, urgency: "holding" };
  return clear;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function EditSheetDatePanel({ extract, onSave, onBack }: EditSheetDatePanelProps) {
  const { colors } = useTheme();
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [reminderKey, setReminderKey] = useState("1hour");
  const [selectedDay, setSelectedDay] = useState<string>(
    extract.due_at ? toDateKey(new Date(extract.due_at)) : toDateKey(new Date()),
  );

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

  const handlePreset = useCallback((key: string) => {
    onSave(buildDatePatch(key));
  }, [onSave]);

  const handleDayPress = useCallback((day: DateData) => {
    setSelectedDay(day.dateString);
    const picked = new Date(day.dateString + "T12:00:00");
    onSave(buildDatePatch("pick", picked));
  }, [onSave]);

  const handleTimePicked = useCallback((_: unknown, date?: Date) => {
    if (Platform.OS === "android") setShowTimePicker(false);
    if (date) onSave(buildDatePatch("pick", date));
  }, [onSave]);

  const handleReminder = useCallback((key: string) => {
    setReminderKey(key);
    const anchor = extract.event_start_at ?? extract.due_at;
    onSave({ reminder_at: reminderIso(key, anchor) });
  }, [extract, onSave]);

  return (
    <View style={local.root}>
      <Pressable style={local.backRow} onPress={onBack} hitSlop={8}>
        <ArrowLeft size={20} color={colors.textPrimary} />
        <Text style={[local.backText, { color: colors.textPrimary }]}>Date & Reminder</Text>
      </Pressable>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: space[4] }}>
        <Text style={[local.label, { color: colors.textTertiary }]}>Quick Pick</Text>
        <View style={local.presetGrid}>
          {DATE_PRESETS.map((p) => (
            <Pressable key={p.key} onPress={() => handlePreset(p.key)} style={[local.preset, { backgroundColor: colors.secondarySurface, borderColor: colors.borderMuted }]}>
              <Text style={[local.presetText, { color: colors.textPrimary }]}>{p.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={[local.label, { color: colors.textTertiary }]}>Pick a Date</Text>
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

        <Pressable style={[local.timeRow, { borderColor: colors.borderMuted }]} onPress={() => setShowTimePicker(!showTimePicker)}>
          <Clock size={18} color={colors.textSecondary} />
          <Text style={[local.timeRowText, { color: colors.textPrimary }]}>
            {showTimePicker ? "Hide time" : "Add time"}
          </Text>
        </Pressable>

        {showTimePicker && (
          <DateTimePicker
            value={extract.due_at ? new Date(extract.due_at) : new Date()}
            mode="time"
            display="spinner"
            onChange={handleTimePicked}
          />
        )}

        <Text style={[local.label, { color: colors.textTertiary }]}>Reminder</Text>
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
      </ScrollView>
    </View>
  );
}

const local = StyleSheet.create({
  root: { flex: 1 },
  backRow: { flexDirection: "row", alignItems: "center", gap: space[2], paddingHorizontal: space[4], paddingVertical: space[3] },
  backText: { fontFamily: fontFamily.sans.semibold, fontSize: fontSize.md },
  label: { fontFamily: fontFamily.sans.medium, fontSize: fontSize.xs, textTransform: "uppercase", letterSpacing: 0.8, marginTop: space[4], marginBottom: space[2], paddingHorizontal: space[4] },
  presetGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: space[4] },
  preset: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: radii.md, borderWidth: 1 },
  presetText: { fontFamily: fontFamily.sans.medium, fontSize: fontSize.sm },
  calendarWrap: { paddingHorizontal: space[2] },
  calendar: { borderRadius: radii.md },
  timeRow: { flexDirection: "row", alignItems: "center", gap: space[3], marginHorizontal: space[4], marginTop: space[3], paddingVertical: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  timeRowText: { fontFamily: fontFamily.sans.regular, fontSize: fontSize.base },
});
