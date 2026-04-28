import { DateTime } from 'luxon';

import type { ExtractRow } from '@/database/schemas/index';
import { isRecurringExtract } from '@/extracts/recurring-series-display';

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
