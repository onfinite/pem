/**
 * Google Calendar often sets `location` to placeholder copy like "See attached Google Meet link"
 * when the conference URL lives elsewhere. Drop it so clients do not show a useless map row.
 */
export function sanitizeGoogleEventLocation(
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
