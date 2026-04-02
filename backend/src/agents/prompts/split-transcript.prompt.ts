/** Max chars sent to the split model (aligned with dump limits). */
export const SPLIT_TRANSCRIPT_MAX_CHARS = 12_000;

/**
 * Split a raw dump into independent actionable thoughts (one prep each).
 */
export function buildSplitTranscriptPrompt(transcript: string): string {
  const clipped = transcript.slice(0, SPLIT_TRANSCRIPT_MAX_CHARS);
  return `Extract separate actionable thoughts from this brain dump. Each thought should be one concrete thing the user wants done (task, decision, research, draft, purchase, etc.).

Rules:
- Prefer multiple thoughts only when the user clearly mixed unrelated asks (e.g. cancel gym AND sell car AND email landlord).
- If it is one coherent ask with constraints, return exactly ONE thought.
- Titles: short, no markdown.

Dump:
"""
${clipped}
"""`;
}
