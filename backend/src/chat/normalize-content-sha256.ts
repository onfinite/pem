/** Returns lowercase 64-char hex or null if invalid / empty. */
export function normalizeContentSha256(
  raw: string | null | undefined,
): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s.length !== 64 || !/^[0-9a-f]{64}$/.test(s)) return null;
  return s;
}
