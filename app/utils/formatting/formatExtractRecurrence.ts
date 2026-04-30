/** ISO weekday: 1 = Monday … 7 = Sunday (matches backend / agent). */
const ISO_DAY_SHORT = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

type RecurrenceRule = {
  freq: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  by_day?: number[] | null;
  by_month_day?: number | null;
  until?: string | null;
  count?: number | null;
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function sortUniqueDays(days: number[]): number[] {
  const valid = days.filter((d) => d >= 1 && d <= 7);
  return [...new Set(valid)].sort((a, b) => a - b);
}

function arraysEqual(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

/** Human label for a set of ISO weekdays, or comma-separated short names. */
function formatByDayPattern(days: number[]): string | null {
  const s = sortUniqueDays(days);
  if (!s.length) return null;
  if (arraysEqual(s, [1, 2, 3, 4, 5])) return "Weekdays";
  if (arraysEqual(s, [6, 7])) return "Weekends";
  if (arraysEqual(s, [1, 2, 3, 4, 5, 6, 7])) return "Every day";
  return s.map((d) => ISO_DAY_SHORT[d] ?? "?").join(", ");
}

function baseFreqInterval(rule: RecurrenceRule): string {
  const { freq, interval } = rule;
  if (freq === "daily" && interval === 1) return "Daily";
  if (freq === "daily" && interval === 2) return "Every other day";
  if (freq === "daily" && interval > 2) return `Every ${interval} days`;
  if (freq === "weekly" && interval === 1) return "Weekly";
  if (freq === "weekly" && interval === 2) return "Every 2 weeks";
  if (freq === "weekly" && interval > 2) return `Every ${interval} weeks`;
  if (freq === "monthly" && interval === 1) return "Monthly";
  if (freq === "monthly") return `Every ${interval} months`;
  if (freq === "yearly") return "Yearly";
  return capitalize(freq);
}

/**
 * Short label for task drawer / lists (recurrence_rule from API).
 */
export function formatExtractRecurrence(rule: RecurrenceRule): string {
  const pattern = rule.by_day?.length
    ? formatByDayPattern(rule.by_day)
    : null;

  if (rule.freq === "weekly" && pattern) {
    if (rule.interval === 1) {
      if (pattern === "Weekdays") return "Weekdays";
      if (pattern === "Weekends") return "Weekends";
      if (pattern === "Every day") return "Every day";
      return `Weekly · ${pattern}`;
    }
    return `Every ${rule.interval} weeks · ${pattern}`;
  }

  if (rule.freq === "daily" && pattern && pattern !== "Every day") {
    return `${baseFreqInterval(rule)} · ${pattern}`;
  }

  return baseFreqInterval(rule);
}
