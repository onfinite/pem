/** Strips non-user-facing lines from stored vision text (e.g. doc type, photo counters). */
export function stripDocumentTypeFromVisionSummary(text: string): string {
  const next = text
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^document type\s*:/i.test(t)) return false;
      if (/^photo\s*\d+\s*\/\s*\d+$/i.test(t)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return next;
}
