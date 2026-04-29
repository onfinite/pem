import type { DateTime } from 'luxon';

/** Monday 00:00 in the same zone as `dt` (Luxon ISO weekday: Monday = 1). */
export function startOfIsoWeekMonday(dt: DateTime): DateTime {
  return dt.minus({ days: dt.weekday - 1 }).startOf('day');
}
