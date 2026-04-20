/** ISO weekday (1=Mon … 7=Sun) → RRULE day abbreviation. */
const ISO_TO_RRULE: Record<number, string> = {
  1: 'MO',
  2: 'TU',
  3: 'WE',
  4: 'TH',
  5: 'FR',
  6: 'SA',
  7: 'SU',
};

export function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s || !String(s).trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function buildRrule(rule: {
  freq: string;
  interval?: number;
  by_day?: number[];
  by_month_day?: number;
  until?: string | null;
  count?: number;
}): string {
  const parts = [`FREQ=${rule.freq.toUpperCase()}`];
  if (rule.interval && rule.interval > 1)
    parts.push(`INTERVAL=${rule.interval}`);
  if (rule.by_day?.length) {
    parts.push(
      `BYDAY=${rule.by_day.map((d) => ISO_TO_RRULE[d] ?? 'MO').join(',')}`,
    );
  }
  if (rule.by_month_day != null) parts.push(`BYMONTHDAY=${rule.by_month_day}`);
  if (rule.until) {
    const u = rule.until
      .replace(/[-:]/g, '')
      .replace(/\.\d+/, '')
      .replace('Z', '');
    parts.push(`UNTIL=${u}Z`);
  }
  if (rule.count) parts.push(`COUNT=${rule.count}`);
  return `RRULE:${parts.join(';')}`;
}
