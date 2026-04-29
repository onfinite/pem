/**
 * Builds key=value pairs for grep-friendly, single-line logs. Skips null,
 * undefined, and empty strings. Truncates long string values.
 */
const MAX_VALUE_LEN = 500;

export function formatLogContext(
  fields: Record<string, string | number | boolean | null | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    const raw =
      typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim()
        : String(value);
    const flat =
      raw.length > MAX_VALUE_LEN ? `${raw.slice(0, MAX_VALUE_LEN)}…` : raw;
    parts.push(`${key}=${flat}`);
  }
  return parts.join(' ');
}

/** Human message plus optional structured suffix (space-separated key=value). */
export function logWithContext(
  message: string,
  fields: Record<string, string | number | boolean | null | undefined>,
): string {
  const ctx = formatLogContext(fields);
  const m = message.trim();
  if (!m) return ctx;
  return ctx ? `${m} ${ctx}` : m;
}
