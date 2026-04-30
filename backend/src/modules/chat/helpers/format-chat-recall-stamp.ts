import { DateTime } from 'luxon';

import { startOfIsoWeekMonday } from '@/core/utils/start-of-iso-week';

/**
 * Human-facing stamp for chat recall context (Ask + agent recent lines).
 * Same calendar day as now → "today"; previous day → "yesterday" (no numeric date).
 * Older: "last Monday, M/D/YYYY" for prior ISO week; else weekday + date.
 */
export function formatChatRecallStamp(
  createdAt: Date,
  now: Date,
  userTimeZone: string | null | undefined,
): string {
  const zone = userTimeZone?.trim() || 'UTC';
  const msg = DateTime.fromJSDate(createdAt, { zone: 'utc' }).setZone(zone);
  const n = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(zone);
  if (!msg.isValid) return createdAt.toISOString();

  const md = msg.toFormat('M/d/yyyy');

  if (msg.hasSame(n, 'day')) {
    return 'today';
  }

  const diffDays = Math.round(
    n.startOf('day').diff(msg.startOf('day'), 'days').days,
  );
  if (diffDays === 1) {
    return 'yesterday';
  }

  const thisWeekStart = startOfIsoWeekMonday(n);
  const priorWeekStart = thisWeekStart.minus({ weeks: 1 });
  const priorWeekEnd = thisWeekStart.minus({ days: 1 }).endOf('day');
  const msgDay = msg.startOf('day');
  if (msgDay >= priorWeekStart && msgDay <= priorWeekEnd) {
    return `last ${msg.toFormat('cccc')}, ${md}`;
  }

  if (diffDays >= 2 && diffDays <= 6) {
    return `${msg.toFormat('cccc')}, ${md}`;
  }

  return `${msg.toFormat('cccc')}, ${md} (${msg.toFormat('MMMM d, yyyy')})`;
}
