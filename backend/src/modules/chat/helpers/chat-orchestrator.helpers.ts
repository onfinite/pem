import type {
  ExtractAction,
  PemAgentOutput,
} from '@/modules/chat/types/pem-agent.types';
import type { MessageLinkRow } from '@/database/schemas/index';

const SAFETY_CAPS = {
  creates: 10,
  updates: 10,
  completions: 10,
  calendar_writes: 5,
  calendar_updates: 5,
  calendar_deletes: 3,
  scheduling: 10,
  recurrence_detections: 10,
  rsvp_actions: 5,
  memory_writes: 10,
} as const;

export function clampAgentOutput(output: PemAgentOutput): PemAgentOutput {
  return {
    ...output,
    creates: output.creates.slice(0, SAFETY_CAPS.creates),
    updates: output.updates.slice(0, SAFETY_CAPS.updates),
    completions: output.completions.slice(0, SAFETY_CAPS.completions),
    calendar_writes: output.calendar_writes.slice(
      0,
      SAFETY_CAPS.calendar_writes,
    ),
    calendar_updates: output.calendar_updates.slice(
      0,
      SAFETY_CAPS.calendar_updates,
    ),
    calendar_deletes: output.calendar_deletes.slice(
      0,
      SAFETY_CAPS.calendar_deletes,
    ),
    scheduling: output.scheduling.slice(0, SAFETY_CAPS.scheduling),
    recurrence_detections: output.recurrence_detections.slice(
      0,
      SAFETY_CAPS.recurrence_detections,
    ),
    rsvp_actions: output.rsvp_actions.slice(0, SAFETY_CAPS.rsvp_actions),
    memory_writes: output.memory_writes.slice(0, SAFETY_CAPS.memory_writes),
  };
}

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

export function displayUrlsFromMessageLinkRows(
  rows: MessageLinkRow[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of rows) {
    const u = (r.canonicalUrl?.trim() || r.originalUrl.trim()).trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

function urlAlreadyReferenced(url: string, haystack: string): boolean {
  const h = haystack.toLowerCase();
  const u = url.toLowerCase();
  if (h.includes(u)) return true;
  try {
    const { hostname, pathname, search } = new URL(url);
    const core = `${hostname.toLowerCase()}${pathname.toLowerCase()}${search.toLowerCase()}`;
    return h.includes(core);
  } catch {
    return false;
  }
}

/** Appends `Link: …` lines for URLs not already present in task text / note / fragment. */
export function mergeMessageLinksIntoExtractPemNote(
  item: ExtractAction,
  urls: string[],
): ExtractAction {
  if (!urls.length) return item;
  const haystack = [item.text, item.pem_note, item.original_text]
    .filter(Boolean)
    .join('\n');
  const missing = urls.filter((u) => !urlAlreadyReferenced(u, haystack));
  if (!missing.length) return item;
  const block = missing.map((u) => `Link: ${u}`).join('\n');
  const prev = item.pem_note?.trim();
  const pem_note = prev ? `${prev}\n\n${block}` : block;
  return { ...item, pem_note };
}
