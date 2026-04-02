/**
 * Optional time-aware profile values (any key). Mirrors `backend/src/profile/profile-timed.ts`.
 */

export const TIMED_PROFILE_VERSION = 1 as const;

export type TimedSegment = {
  value: string;
  from: string;
  to: string;
};

export type TimedProfileValue = {
  v: typeof TIMED_PROFILE_VERSION;
  kind: "timed";
  current: string;
  previous: TimedSegment[];
};

function isIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
}

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.trim().length > 0;
}

export function isTimedProfileValue(x: unknown): x is TimedProfileValue {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.v !== TIMED_PROFILE_VERSION) return false;
  if (o.kind !== "timed") return false;
  if (!isNonEmptyString(o.current)) return false;
  if (!Array.isArray(o.previous)) return false;
  for (const seg of o.previous) {
    if (!seg || typeof seg !== "object") return false;
    const s = seg as Record<string, unknown>;
    if (!isNonEmptyString(s.value)) return false;
    if (!isNonEmptyString(s.from) || !isIsoDate(s.from)) return false;
    if (!isNonEmptyString(s.to) || !isIsoDate(s.to)) return false;
  }
  return true;
}

export function storedValueIsTimedJson(raw: string): boolean {
  const t = raw.trim();
  if (!t.startsWith("{")) return false;
  try {
    const o = JSON.parse(t) as unknown;
    return isTimedProfileValue(o);
  } catch {
    return false;
  }
}

export function parseTimedValue(raw: string): TimedProfileValue {
  const t = raw.trim();
  if (!t) {
    return {
      v: TIMED_PROFILE_VERSION,
      kind: "timed",
      current: "",
      previous: [],
    };
  }
  if (!t.startsWith("{")) {
    return {
      v: TIMED_PROFILE_VERSION,
      kind: "timed",
      current: t,
      previous: [],
    };
  }
  try {
    const o = JSON.parse(t) as unknown;
    if (isTimedProfileValue(o)) {
      return {
        v: TIMED_PROFILE_VERSION,
        kind: "timed",
        current: o.current.trim(),
        previous: o.previous.map((p) => ({
          value: p.value.trim(),
          from: p.from.trim(),
          to: p.to.trim(),
        })),
      };
    }
  } catch {
    throw new Error("INVALID_JSON");
  }
  throw new Error("INVALID_JSON");
}

export function serializeTimedValue(v: TimedProfileValue): string {
  return JSON.stringify({
    v: TIMED_PROFILE_VERSION,
    kind: "timed",
    current: v.current.trim(),
    previous: v.previous.map((p) => ({
      value: p.value.trim(),
      from: p.from.trim(),
      to: p.to.trim(),
    })),
  });
}

export function emptyTimedValue(): TimedProfileValue {
  return {
    v: TIMED_PROFILE_VERSION,
    kind: "timed",
    current: "",
    previous: [],
  };
}

export function normalizeProfileKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 128);
}

/**
 * Parses `kind: "timed"` JSON that does not pass strict validation (e.g. empty
 * `current`, loose dates). Used for display and edit only.
 */
export function parseLooseTimedForDisplay(raw: string): TimedProfileValue | null {
  const t = raw.trim();
  if (!t.startsWith("{")) return null;
  try {
    const o = JSON.parse(t) as unknown;
    if (!o || typeof o !== "object" || Array.isArray(o)) return null;
    const r = o as Record<string, unknown>;
    if (r.kind !== "timed") return null;
    const current = typeof r.current === "string" ? r.current.trim() : "";
    const previous: TimedSegment[] = [];
    if (Array.isArray(r.previous)) {
      for (const seg of r.previous) {
        if (!seg || typeof seg !== "object") continue;
        const s = seg as Record<string, unknown>;
        const value = typeof s.value === "string" ? s.value.trim() : "";
        const from = typeof s.from === "string" ? s.from.trim() : "";
        const to = typeof s.to === "string" ? s.to.trim() : "";
        if (value || from || to) {
          previous.push({
            value: value || "—",
            from: from || "—",
            to: to || "—",
          });
        }
      }
    }
    return {
      v: TIMED_PROFILE_VERSION,
      kind: "timed",
      current,
      previous,
    };
  } catch {
    return null;
  }
}

/** Strict or loose timed JSON → editable struct; otherwise null. */
export function tryParseTimedForEdit(raw: string): TimedProfileValue | null {
  if (storedValueIsTimedJson(raw)) {
    try {
      return parseTimedValue(raw);
    } catch {
      return parseLooseTimedForDisplay(raw);
    }
  }
  return parseLooseTimedForDisplay(raw);
}

export function formatTimedCardFromStruct(v: TimedProfileValue): string {
  const lines: string[] = [];
  lines.push(`Current: ${v.current.trim() || "—"}`);
  if (v.previous.length > 0) {
    lines.push("");
    lines.push("Previously:");
    for (const p of v.previous) {
      lines.push(`• ${p.value} — ${p.from} → ${p.to}`);
    }
  }
  return lines.join("\n");
}

function formatGenericObjectForDisplay(o: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) {
      parts.push(`${k}: —`);
    } else if (typeof v === "string") {
      parts.push(`${k}: ${v}`);
    } else if (typeof v === "number" || typeof v === "boolean") {
      parts.push(`${k}: ${String(v)}`);
    } else {
      parts.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return parts.join("\n");
}

/**
 * Human-readable profile value for Settings (never raw timed JSON when we can
 * recognize `kind: "timed"` or generic JSON objects).
 */
export function formatProfileValueForDisplay(raw: string): string {
  if (storedValueIsTimedJson(raw)) {
    try {
      return formatTimedCardFromStruct(parseTimedValue(raw));
    } catch {
      /* fall through */
    }
  }
  const loose = parseLooseTimedForDisplay(raw);
  if (loose) {
    return formatTimedCardFromStruct(loose);
  }
  const t = raw.trim();
  if (t.startsWith("{")) {
    try {
      const o = JSON.parse(t) as unknown;
      if (o && typeof o === "object" && !Array.isArray(o)) {
        return formatGenericObjectForDisplay(o as Record<string, unknown>);
      }
    } catch {
      /* ignore */
    }
  }
  return raw;
}

/** Same as {@link formatProfileValueForDisplay}; kept for older imports. */
export function formatTimedCard(raw: string): string {
  return formatProfileValueForDisplay(raw);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
