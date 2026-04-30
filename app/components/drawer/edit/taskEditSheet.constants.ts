import type { ApiExtract } from "@/services/api/pemApi";
import type { ChipOption } from "@/components/drawer/edit/EditSheetChipRow";

export const SWIPE_THRESHOLD = 60;

export const PRIORITY_CHIPS: ChipOption[] = [
  { key: "high", label: "High", activeColor: "#d70015" },
  { key: "medium", label: "Medium", activeColor: "#e8763a" },
  { key: "low", label: "Low", activeColor: "#007aff" },
  { key: "none", label: "None" },
];

export const REMINDER_CHIPS: ChipOption[] = [
  { key: "15min", label: "15 min before" },
  { key: "1hour", label: "1 hour before" },
  { key: "morning", label: "Morning of" },
  { key: "custom", label: "Custom" },
  { key: "none", label: "None" },
];

export function reminderKeyFor(extract: ApiExtract): string {
  if (!extract.reminder_at) return "none";
  const anchor = extract.event_start_at ?? extract.due_at;
  if (!anchor) return "custom";
  const mins = Math.round(
    (new Date(anchor).getTime() - new Date(extract.reminder_at).getTime()) / 60_000,
  );
  if (mins === 15) return "15min";
  if (mins === 60) return "1hour";
  const r = new Date(extract.reminder_at);
  if (r.getHours() === 9 && r.getMinutes() === 0) return "morning";
  return "custom";
}

export function reminderIso(key: string, anchor: string | null): string | null {
  if (key === "none" || key === "custom" || !anchor) return null;
  const ms = new Date(anchor).getTime();
  if (key === "15min") return new Date(ms - 15 * 60_000).toISOString();
  if (key === "1hour") return new Date(ms - 60 * 60_000).toISOString();
  const d = new Date(anchor);
  d.setHours(9, 0, 0, 0);
  return d.toISOString();
}
