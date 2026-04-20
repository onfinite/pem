import { DateTime } from 'luxon';

import type { ExtractRow, RecurrenceRule } from '../database/schemas';

function hasRecurrenceRule(row: ExtractRow): boolean {
  const r = row.recurrenceRule as RecurrenceRule | null | undefined;
  return !!(r && typeof r === 'object' && r.freq);
}

/** Parent template or child instance of a recurring habit. */
export function isRecurringExtract(row: ExtractRow): boolean {
  return hasRecurrenceRule(row) || row.recurrenceParentId != null;
}

/** Stable id for grouping open instances (parent id for the whole series). */
export function getRecurrenceSeriesId(row: ExtractRow): string | null {
  if (!isRecurringExtract(row)) return null;
  return row.recurrenceParentId ?? row.id;
}

function rowWindowEnd(row: ExtractRow): Date | null {
  return row.periodEnd ?? row.dueAt ?? row.snoozedUntil ?? null;
}

function rowWindowStart(row: ExtractRow): Date | null {
  if (row.status === 'snoozed' && row.snoozedUntil) return row.snoozedUntil;
  return (
    row.periodStart ?? row.dueAt ?? row.scheduledAt ?? row.eventStartAt ?? null
  );
}

function toZoned(dt: Date, zone: string): DateTime {
  return DateTime.fromJSDate(dt, { zone: 'utc' }).setZone(zone);
}

function rowCoversNow(
  row: ExtractRow,
  nowLux: DateTime,
  zone: string,
): boolean {
  if (row.status === 'snoozed' && row.snoozedUntil) {
    const su = toZoned(row.snoozedUntil, zone);
    return nowLux >= su.startOf('day') && nowLux <= su.endOf('day');
  }
  if (row.periodStart && row.periodEnd) {
    const a = toZoned(row.periodStart, zone);
    const b = toZoned(row.periodEnd, zone);
    return nowLux >= a && nowLux <= b;
  }
  if (row.dueAt) {
    const d = toZoned(row.dueAt, zone).startOf('day');
    return d.hasSame(nowLux, 'day');
  }
  return false;
}

function isStillRelevantWindow(
  row: ExtractRow,
  todayStartLux: DateTime,
  zone: string,
): boolean {
  const end = rowWindowEnd(row);
  if (!end) return true;
  return toZoned(end, zone) >= todayStartLux;
}

function pickMinByPeriodStart(rows: ExtractRow[]): ExtractRow {
  return [...rows].sort((a, b) => {
    const as = rowWindowStart(a);
    const bs = rowWindowStart(b);
    const am = as ? as.getTime() : Infinity;
    const bm = bs ? bs.getTime() : Infinity;
    if (am !== bm) return am - bm;
    return a.id.localeCompare(b.id);
  })[0];
}

function pickOneFromRecurrenceGroup(
  group: ExtractRow[],
  nowLux: DateTime,
): ExtractRow | null {
  const zone = nowLux.zoneName ?? 'UTC';
  const todayStartLux = nowLux.startOf('day');
  const todayEndLux = nowLux.endOf('day');

  const parent = group.find(
    (r) => hasRecurrenceRule(r) && !r.recurrenceParentId,
  );
  const hasChild = group.some(
    (r) =>
      r.recurrenceParentId != null &&
      parent &&
      r.recurrenceParentId === parent.id,
  );

  let candidates = group.filter(
    (r) => r.status === 'inbox' || r.status === 'snoozed',
  );
  if (parent && hasChild) {
    candidates = candidates.filter((r) => r.id !== parent.id);
  }

  if (candidates.length === 0) return null;

  const windowOk = candidates.filter((r) =>
    isStillRelevantWindow(r, todayStartLux, zone),
  );

  if (windowOk.length === 0) {
    const futureOnly = candidates.filter((r) => {
      const ps = rowWindowStart(r);
      if (!ps) return false;
      return toZoned(ps, zone) > todayEndLux;
    });
    if (futureOnly.length > 0) return pickMinByPeriodStart(futureOnly);
    return null;
  }

  const pool = windowOk;

  const todayHits = pool.filter((r) => rowCoversNow(r, nowLux, zone));
  if (todayHits.length > 0) return pickMinByPeriodStart(todayHits);

  const future = pool.filter((r) => {
    const ps = rowWindowStart(r);
    if (!ps) return false;
    return toZoned(ps, zone) > todayEndLux;
  });
  if (future.length > 0) return pickMinByPeriodStart(future);

  return pickMinByPeriodStart(pool);
}

/**
 * One visible row per recurrence series; preserves relative order of `rows`
 * (filter-only: drops non-chosen recurring rows).
 */
export function collapseRecurringRowsForDisplay(
  rows: ExtractRow[],
  nowLux: DateTime,
): ExtractRow[] {
  const groups = new Map<string, ExtractRow[]>();
  for (const row of rows) {
    if (!isRecurringExtract(row)) continue;
    const sid = getRecurrenceSeriesId(row)!;
    const g = groups.get(sid) ?? [];
    g.push(row);
    groups.set(sid, g);
  }

  const chosenBySeries = new Map<string, ExtractRow>();
  for (const [, group] of groups) {
    const one = pickOneFromRecurrenceGroup(group, nowLux);
    if (one) chosenBySeries.set(getRecurrenceSeriesId(one)!, one);
  }

  return rows.filter((r) => {
    if (!isRecurringExtract(r)) return true;
    const sid = getRecurrenceSeriesId(r)!;
    const chosen = chosenBySeries.get(sid);
    return !!chosen && chosen.id === r.id;
  });
}
