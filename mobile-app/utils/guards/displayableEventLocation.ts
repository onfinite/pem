/**
 * Hides Google Calendar placeholder copy in the inbox meta row (legacy rows may still have it).
 */
export function displayableEventLocation(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^see\s+(the\s+)?attached\s+google\s+meet\s+link\.?$/i.test(t)) {
    return null;
  }
  if (/^join\s+with\s+google\s+meet\.?$/i.test(t)) return null;
  return t;
}
