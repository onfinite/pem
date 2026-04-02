/**
 * Optional **time-aware** profile values (any key). Stored as JSON in `user_profile.value`
 * when the user (or app) chooses history + dates. Most facts stay a plain string.
 */

export const TIMED_PROFILE_VERSION = 1 as const;

export type TimedSegment = {
  /** What was true during [from, to] (e.g. place, employer, role). */
  value: string;
  from: string;
  to: string;
};

export type TimedProfileValue = {
  v: typeof TIMED_PROFILE_VERSION;
  kind: 'timed';
  current: string;
  previous: TimedSegment[];
};

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

export function isTimedProfileValue(x: unknown): x is TimedProfileValue {
  if (!x || typeof x !== 'object') return false;
  const o = x as Record<string, unknown>;
  if (o.v !== TIMED_PROFILE_VERSION) return false;
  if (o.kind !== 'timed') return false;
  if (!isNonEmptyString(o.current)) return false;
  if (!Array.isArray(o.previous)) return false;
  for (const seg of o.previous) {
    if (!seg || typeof seg !== 'object') return false;
    const s = seg as Record<string, unknown>;
    if (!isNonEmptyString(s.value)) return false;
    if (!isNonEmptyString(s.from) || !isIsoDate(s.from)) return false;
    if (!isNonEmptyString(s.to) || !isIsoDate(s.to)) return false;
  }
  return true;
}

/** True if `raw` is JSON for a timed fact (`kind: "timed"`). */
export function storedValueIsTimedJson(raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith('{')) return false;
  try {
    const o = JSON.parse(t) as unknown;
    return isTimedProfileValue(o);
  } catch {
    return false;
  }
}

/**
 * Parses `kind: 'timed'` JSON that does not pass strict validation (e.g. empty
 * `current`). Used for agent-facing text and display only.
 */
export function parseLooseTimedForDisplay(raw: string): TimedProfileValue | null {
  const t = raw.trim();
  if (!t.startsWith('{')) return null;
  try {
    const o = JSON.parse(t) as unknown;
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    const r = o as Record<string, unknown>;
    if (r.kind !== 'timed') return null;
    const current = typeof r.current === 'string' ? r.current.trim() : '';
    const previous: TimedSegment[] = [];
    if (Array.isArray(r.previous)) {
      for (const seg of r.previous) {
        if (!seg || typeof seg !== 'object') continue;
        const s = seg as Record<string, unknown>;
        const value = typeof s.value === 'string' ? s.value.trim() : '';
        const from = typeof s.from === 'string' ? s.from.trim() : '';
        const to = typeof s.to === 'string' ? s.to.trim() : '';
        if (value || from || to) {
          previous.push({
            value: value || '—',
            from: from || '—',
            to: to || '—',
          });
        }
      }
    }
    return {
      v: TIMED_PROFILE_VERSION,
      kind: 'timed',
      current,
      previous,
    };
  } catch {
    return null;
  }
}

export function parseTimedValue(raw: string): TimedProfileValue {
  const t = raw.trim();
  if (!t) {
    return {
      v: TIMED_PROFILE_VERSION,
      kind: 'timed',
      current: '',
      previous: [],
    };
  }
  if (!t.startsWith('{')) {
    return {
      v: TIMED_PROFILE_VERSION,
      kind: 'timed',
      current: t,
      previous: [],
    };
  }
  try {
    const o = JSON.parse(t) as unknown;
    if (isTimedProfileValue(o)) {
      return {
        v: TIMED_PROFILE_VERSION,
        kind: 'timed',
        current: o.current.trim(),
        previous: o.previous.map((p) => ({
          value: p.value.trim(),
          from: p.from.trim(),
          to: p.to.trim(),
        })),
      };
    }
  } catch {
    throw new Error('INVALID_JSON');
  }
  throw new Error('INVALID_JSON');
}

export function serializeTimedValue(v: TimedProfileValue): string {
  return JSON.stringify({
    v: TIMED_PROFILE_VERSION,
    kind: 'timed',
    current: v.current.trim(),
    previous: v.previous.map((p) => ({
      value: p.value.trim(),
      from: p.from.trim(),
      to: p.to.trim(),
    })),
  });
}

export function validateTimedValue(v: TimedProfileValue): void {
  if (!v.current.trim()) {
    throw new Error('CURRENT_REQUIRED');
  }
  for (const p of v.previous) {
    if (p.from > p.to) {
      throw new Error('DATE_ORDER');
    }
  }
}

/**
 * Canonical DB string for structured timed facts. Only `kind: "timed"` JSON.
 * Plain text must be stored as-is (do not call this for non-JSON values).
 */
export function normalizeTimedInput(raw: string): string {
  const t = raw.trim();
  if (!t) {
    throw new Error('EMPTY');
  }
  if (!t.startsWith('{')) {
    throw new Error('EXPECTED_JSON');
  }
  try {
    const o = JSON.parse(t) as unknown;
    if (isTimedProfileValue(o)) {
      const v = parseTimedValue(JSON.stringify(o));
      validateTimedValue(v);
      return serializeTimedValue(v);
    }
  } catch (e) {
    if (e instanceof Error && e.message === 'CURRENT_REQUIRED') throw e;
    if (e instanceof Error && e.message === 'DATE_ORDER') throw e;
    if (e instanceof Error && e.message === 'EMPTY') throw e;
  }
  throw new Error('INVALID_JSON');
}

function formatTimedForAgentFromStruct(v: TimedProfileValue): string {
  if (!v.current && v.previous.length === 0) {
    return '(not set)';
  }
  const prevParts = v.previous.map((p) => `${p.value} (${p.from} → ${p.to})`);
  const prev =
    prevParts.length > 0 ? ` Previously: ${prevParts.join('; ')}.` : '';
  return `Now: ${v.current || '—'}.${prev}`;
}

/** One line for agent / prep context (any key). */
export function formatTimedForAgent(raw: string): string {
  if (storedValueIsTimedJson(raw)) {
    try {
      return formatTimedForAgentFromStruct(parseTimedValue(raw));
    } catch {
      /* fall through */
    }
  }
  const loose = parseLooseTimedForDisplay(raw);
  if (loose) {
    return formatTimedForAgentFromStruct(loose);
  }
  return raw;
}
