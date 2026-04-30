import { DateTime } from 'luxon';

const RELATIVE_PERIOD_LABELS = new Set(['today', 'tomorrow', 'tonight', 'now']);

/**
 * Agents sometimes emit period_label "today" while period_start is a future day.
 * Drop relative labels that contradict the anchored calendar day in the user's zone.
 */
export function reconcileRelativePeriodLabel(
  label: string | null | undefined,
  periodStart: Date | null,
  userTz: string | null,
): string | null {
  if (!label?.trim()) return null;
  const trimmed = label.trim();
  if (!periodStart || Number.isNaN(periodStart.getTime())) return trimmed;

  const pl = trimmed.toLowerCase();
  if (!RELATIVE_PERIOD_LABELS.has(pl)) return trimmed;

  const zone = userTz && userTz.length > 0 ? userTz : 'UTC';
  const startDay = DateTime.fromJSDate(periodStart, { zone: 'utc' })
    .setZone(zone)
    .startOf('day');
  const todayDay = DateTime.now().setZone(zone).startOf('day');
  const diffDays = Math.round(startDay.diff(todayDay, 'days').days);

  if (pl === 'today' && diffDays !== 0) return null;
  if (pl === 'tomorrow' && diffDays !== 1) return null;
  if ((pl === 'tonight' || pl === 'now') && diffDays !== 0) return null;
  return trimmed;
}
