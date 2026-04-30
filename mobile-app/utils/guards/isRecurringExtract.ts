import type { ApiExtract } from "@/services/api/pemApi";

export function isRecurringExtract(item: ApiExtract): boolean {
  if (item.recurrence_parent_id) return true;
  const r = item.recurrence_rule;
  return !!(
    r &&
    typeof r === "object" &&
    "freq" in r &&
    (r as { freq?: string }).freq
  );
}
