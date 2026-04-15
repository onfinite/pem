import type { ApiExtract } from "@/lib/pemApi";
import { isCalendarBackedExtract } from "./calendarExtract";

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function anchorMs(t: ApiExtract): number | null {
  const iso =
    t.event_start_at ?? t.scheduled_at ?? t.due_at ?? t.period_start;
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function sortAnchorMs(t: ApiExtract): number | null {
  const iso =
    t.event_start_at ??
    t.scheduled_at ??
    t.due_at ??
    t.period_start ??
    t.snoozed_until;
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

function startOfDay(ref: Date): Date {
  return new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
}

function startOfWeekMonday(ref: Date): Date {
  const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate());
  const dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

function sortByDate(items: ApiExtract[]): ApiExtract[] {
  return [...items].sort((a, b) => {
    const ta = sortAnchorMs(a);
    const tb = sortAnchorMs(b);
    if (ta !== null && tb !== null && ta !== tb) return ta - tb;
    if (ta === null && tb !== null) return 1;
    if (ta !== null && tb === null) return -1;
    return Date.parse(a.created_at) - Date.parse(b.created_at);
  });
}

function isOverdue(t: ApiExtract, nowMs: number, todayStartMs: number): boolean {
  // Guard: if the task's main anchor is in the future, never mark overdue
  const anchor = t.event_start_at ?? t.scheduled_at ?? t.due_at ?? t.period_start;
  if (anchor) {
    const anchorDate = Date.parse(anchor);
    if (Number.isFinite(anchorDate) && anchorDate >= todayStartMs) return false;
  }

  const periodEnd = t.period_end ? Date.parse(t.period_end) : null;
  if (periodEnd && Number.isFinite(periodEnd)) {
    return periodEnd < todayStartMs;
  }

  const dueAt = t.due_at ? Date.parse(t.due_at) : null;
  if (dueAt && Number.isFinite(dueAt) && dueAt < todayStartMs) return true;

  return false;
}

export type DynamicSection = {
  key: string;
  label: string;
  items: ApiExtract[];
};

export type InboxPartition = {
  sections: DynamicSection[];
  someday: ApiExtract[];
};

export function partitionInboxTasks(tasks: ApiExtract[]): InboxPartition {
  const now = new Date();
  const nowMs = now.getTime();
  const todayStartMs = startOfDay(now).getTime();
  const todayEnd = endOfDay(now).getTime();
  const tomorrowEnd = endOfDay(
    new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1),
  ).getTime();
  const weekMon = startOfWeekMonday(now);
  const thisWeekEnd = endOfDay(
    new Date(weekMon.getFullYear(), weekMon.getMonth(), weekMon.getDate() + 6),
  ).getTime();

  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonthEnd = endOfDay(
    new Date(now.getFullYear(), now.getMonth() + 2, 0),
  ).getTime();

  const buckets: Record<string, { label: string; items: ApiExtract[] }> = {};
  const someday: ApiExtract[] = [];

  const ensureBucket = (key: string, label: string) => {
    if (!buckets[key]) buckets[key] = { label, items: [] };
  };

  for (const t of tasks) {
    if (t.urgency === "someday") { someday.push(t); continue; }

    const calBacked = isCalendarBackedExtract(t);
    const eventEnd = t.event_end_at ? Date.parse(t.event_end_at) : null;
    if (calBacked && eventEnd && eventEnd < nowMs) continue;

    const ms = anchorMs(t);
    if (ms === null) { someday.push(t); continue; }

    const pStart = t.period_start ? Date.parse(t.period_start) : null;
    const pEnd = t.period_end ? Date.parse(t.period_end) : null;
    const periodCoversToday =
      pStart != null && pEnd != null && pStart <= todayEnd && pEnd >= todayStartMs;

    if (!calBacked && isOverdue(t, nowMs, todayStartMs)) {
      ensureBucket("overdue", "Overdue");
      buckets.overdue.items.push(t);
    } else if (periodCoversToday || ms <= todayEnd) {
      ensureBucket("today", "Today");
      buckets.today.items.push(t);
    } else if (ms <= tomorrowEnd) {
      ensureBucket("tomorrow", "Tomorrow");
      buckets.tomorrow.items.push(t);
    } else if (ms <= thisWeekEnd) {
      ensureBucket("this_week", "This week");
      buckets.this_week.items.push(t);
    } else if (ms < nextMonthStart.getTime()) {
      const monthLabel = labelForMonth(new Date(ms));
      const key = `month_${monthLabel.toLowerCase().replace(/\s+/g, "_")}`;
      ensureBucket(key, monthLabel);
      buckets[key].items.push(t);
    } else if (ms <= nextMonthEnd) {
      ensureBucket("next_month", "Next month");
      buckets.next_month.items.push(t);
    } else {
      const monthLabel = labelForMonth(new Date(ms));
      const key = `later_${monthLabel.toLowerCase().replace(/\s+/g, "_")}`;
      ensureBucket(key, capitalize(monthLabel));
      buckets[key].items.push(t);
    }
  }

  const order = ["overdue", "today", "tomorrow", "this_week"];
  const sections: DynamicSection[] = [];
  for (const key of order) {
    const b = buckets[key];
    if (b && b.items.length > 0) {
      sections.push({ key, label: b.label, items: sortByDate(b.items) });
    }
  }

  const laterKeys = Object.keys(buckets)
    .filter((k) => !order.includes(k))
    .sort((a, b) => {
      const aMs = anchorMs(buckets[a].items[0]) ?? Infinity;
      const bMs = anchorMs(buckets[b].items[0]) ?? Infinity;
      return aMs - bMs;
    });
  for (const key of laterKeys) {
    const b = buckets[key];
    if (b.items.length > 0) {
      sections.push({ key, label: b.label, items: sortByDate(b.items) });
    }
  }

  return {
    sections,
    someday: sortByDate(someday),
  };
}

function labelForMonth(d: Date): string {
  const now = new Date();
  if (d.getFullYear() !== now.getFullYear()) {
    return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  }
  return d.toLocaleDateString(undefined, { month: "long" });
}
