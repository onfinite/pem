import { DateTime } from 'luxon';

import type { ExtractRow } from '@/database/schemas/index';
import { classifyExtractBriefBucket } from '@/extracts/extract-brief-bucket';
import { collapseRecurringRowsForDisplay } from '@/extracts/recurring-series-display';

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
