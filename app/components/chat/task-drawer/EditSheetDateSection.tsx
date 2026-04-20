import { useTheme } from "@/contexts/ThemeContext";
import type { ApiExtract } from "@/lib/pemApi";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useState } from "react";
import { Platform, Text, View } from "react-native";
import { EditSheetChipRow, type ChipOption } from "./EditSheetChipRow";
import { editSheetStyles as s } from "./taskEditSheet.styles";

const DATE_CHIPS: ChipOption[] = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekend", label: "This Weekend" },
  { key: "next_week", label: "Next Week" },
  { key: "pick", label: "Pick Date" },
  { key: "holding", label: "Holding" },
  { key: "no_date", label: "No Date" },
];

function activeDateKey(extract: ApiExtract): string {
  if (extract.urgency === "holding") return "holding";
  const dueAt = extract.due_at ? new Date(extract.due_at) : null;
  if (dueAt) {
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(now.getDate() + 1);
    if (dueAt.toDateString() === now.toDateString()) return "today";
    if (dueAt.toDateString() === tomorrow.toDateString()) return "tomorrow";
    return "pick";
  }
  const label = extract.period_label?.toLowerCase();
  if (label?.includes("weekend")) return "weekend";
  if (label?.includes("next week")) return "next_week";
  if (extract.period_start) return "pick";
  return "no_date";
}

function buildPatch(
  key: string,
  pickedDate?: Date,
): Record<string, unknown> {
  const eod = (d: Date) => {
    d.setHours(23, 59, 59, 999);
    return d;
  };
  const clear = {
    due_at: null,
    period_start: null,
    period_end: null,
    period_label: null,
    urgency: "none",
  };

  if (key === "today") return { ...clear, due_at: eod(new Date()).toISOString() };

  if (key === "tomorrow") {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return { ...clear, due_at: eod(d).toISOString() };
  }

  if (key === "weekend") {
    const sat = new Date();
    sat.setDate(sat.getDate() + ((6 - sat.getDay() + 7) % 7 || 7));
    sat.setHours(0, 0, 0, 0);
    const sun = new Date(sat);
    sun.setDate(sun.getDate() + 1);
    eod(sun);
    return { ...clear, period_start: sat.toISOString(), period_end: sun.toISOString(), period_label: "weekend" };
  }

  if (key === "next_week") {
    const mon = new Date();
    mon.setDate(mon.getDate() + ((8 - mon.getDay()) % 7 || 7));
    mon.setHours(0, 0, 0, 0);
    const fri = new Date(mon);
    fri.setDate(fri.getDate() + 4);
    eod(fri);
    return { ...clear, period_start: mon.toISOString(), period_end: fri.toISOString(), period_label: "next week" };
  }

  if (key === "pick" && pickedDate) {
    return { ...clear, due_at: eod(pickedDate).toISOString() };
  }

  if (key === "holding") return { ...clear, urgency: "holding" };

  return clear;
}

interface EditSheetDateSectionProps {
  extract: ApiExtract;
  onSave: (patch: Record<string, unknown>) => void;
}

export function EditSheetDateSection({ extract, onSave }: EditSheetDateSectionProps) {
  const { colors } = useTheme();
  const [showPicker, setShowPicker] = useState(false);
  const activeKey = activeDateKey(extract);

  const handleSelect = useCallback(
    (key: string) => {
      if (key === "pick") {
        setShowPicker(true);
        return;
      }
      setShowPicker(false);
      onSave(buildPatch(key));
    },
    [onSave],
  );

  const handleDateChange = useCallback(
    (_: unknown, date?: Date) => {
      if (Platform.OS === "android") setShowPicker(false);
      if (date) onSave(buildPatch("pick", date));
    },
    [onSave],
  );

  return (
    <View>
      <Text style={[s.sectionLabel, { color: colors.textTertiary }]}>Date</Text>
      <EditSheetChipRow options={DATE_CHIPS} activeKey={activeKey} onSelect={handleSelect} />
      {showPicker && (
        <DateTimePicker
          value={extract.due_at ? new Date(extract.due_at) : new Date()}
          mode="date"
          display="inline"
          onChange={handleDateChange}
          minimumDate={new Date()}
        />
      )}
    </View>
  );
}
