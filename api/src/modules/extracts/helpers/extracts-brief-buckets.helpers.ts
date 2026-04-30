import { DateTime } from 'luxon';

import type { ExtractRow } from '@/database/schemas/index';
import {
  collapseRecurringRowsForDisplay,
  isRecurringExtract,
} from '@/modules/extracts/helpers/recurring-series-display';

export type BriefBucketKind =
  | 'overdue'
  | 'today'
  | 'tomorrow'
  | 'this_week'
  | 'next_week'
  | 'later'
  | null;

/** Same bucketing as the home brief — used by `buildBriefBuckets` and `getTaskCounts`. */
export function classifyExtractBriefBucket(
  row: ExtractRow,
  nowLux: DateTime,
): BriefBucketKind {
  const now = nowLux.toJSDate();
  const todayStart = nowLux.startOf('day').toJSDate();
  const todayEnd = nowLux.endOf('day').toJSDate();
  const tomorrowEnd = nowLux.plus({ days: 1 }).endOf('day').toJSDate();
  const daysToSunday = 7 - nowLux.weekday;
  const thisWeekEnd = nowLux
    .plus({ days: daysToSunday })
    .endOf('day')
    .toJSDate();
  const nextWeekEnd = nowLux
    .plus({ days: daysToSunday + 7 })
    .endOf('day')
    .toJSDate();

  const anchor =
    row.status === 'snoozed' && row.snoozedUntil
      ? row.snoozedUntil
      : (row.scheduledAt ??
        row.eventStartAt ??
        row.dueAt ??
        row.periodStart ??
        null);

  if (row.urgency === 'holding' && !(row.batchKey === 'shopping' && anchor)) {
    return null;
  }

  const isCalEvent = row.source === 'calendar' || !!row.externalEventId;
  if (isCalEvent && row.eventEndAt && row.eventEndAt < now) return null;

  const periodCoversToday =
    row.periodStart &&
    row.periodEnd &&
    row.periodStart <= todayEnd &&
    row.periodEnd >= todayStart;

  const anchorBeforeToday = anchor && anchor < todayStart;
  const isDueOverdue =
    !isCalEvent &&
    !isRecurringExtract(row) &&
    anchorBeforeToday &&
    row.dueAt &&
    row.dueAt < todayStart;

  if (isDueOverdue) return 'overdue';
  if (periodCoversToday || (anchor && anchor <= todayEnd)) return 'today';
  if (anchor && anchor <= tomorrowEnd) return 'tomorrow';
  if (anchor && anchor <= thisWeekEnd) return 'this_week';
  if (anchor && anchor <= nextWeekEnd) return 'next_week';
  if (anchor) return 'later';
  return null;
}

export type BriefBuckets = {
  overdue: ExtractRow[];
  today: ExtractRow[];
  tomorrow: ExtractRow[];
  this_week: ExtractRow[];
  next_week: ExtractRow[];
  later: ExtractRow[];
  batch_counts: { batch_key: string; count: number }[];
};

export function buildBriefBuckets(
  rows: ExtractRow[],
  zone: string,
): BriefBuckets {
  const nowLux = DateTime.now().setZone(zone);
  const displayRows = collapseRecurringRowsForDisplay(rows, nowLux);

  const overdue: ExtractRow[] = [];
  const today: ExtractRow[] = [];
  const tomorrow: ExtractRow[] = [];
  const thisWeek: ExtractRow[] = [];
  const nextWeek: ExtractRow[] = [];
  const later: ExtractRow[] = [];

  for (const row of displayRows) {
    const kind = classifyExtractBriefBucket(row, nowLux);
    if (kind === 'overdue') overdue.push(row);
    else if (kind === 'today') today.push(row);
    else if (kind === 'tomorrow') tomorrow.push(row);
    else if (kind === 'this_week') thisWeek.push(row);
    else if (kind === 'next_week') nextWeek.push(row);
    else if (kind === 'later') later.push(row);
  }

  const sortByAnchor = (a: ExtractRow, b: ExtractRow) => {
    const getTime = (r: ExtractRow) =>
      r.status === 'snoozed' && r.snoozedUntil
        ? r.snoozedUntil.getTime()
        : (r.scheduledAt?.getTime() ??
          r.eventStartAt?.getTime() ??
          r.dueAt?.getTime() ??
          r.periodStart?.getTime() ??
          Infinity);
    return getTime(a) - getTime(b);
  };
  today.sort(sortByAnchor);
  tomorrow.sort(sortByAnchor);
  thisWeek.sort(sortByAnchor);
  nextWeek.sort(sortByAnchor);
  later.sort(sortByAnchor);

  const batchKeys = ['shopping', 'follow_ups'] as const;
  const batch_counts = batchKeys.map((bk) => ({
    batch_key: bk,
    count: displayRows.filter((r) => r.batchKey === bk).length,
  }));

  return {
    overdue,
    today,
    tomorrow,
    this_week: thisWeek,
    next_week: nextWeek,
    later,
    batch_counts,
  };
}
