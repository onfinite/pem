import { z } from 'zod';

/** Per-thought intent after split — aligns with `.cursor/rules/pem-intake-routing.mdc`. */
export const PREP_INTENTS = [
  'SHOPPING',
  'RESEARCH',
  'DRAFT',
  'COMPARISON',
  'DECISION',
  'LEGAL_FINANCIAL',
  'LIFE_ADMIN',
  'TASK_UNCLEAR',
  'SUMMARIZE',
  'FIND_PERSON',
  'FIND_PLACE',
  'SCHEDULE_PREP',
  'CONTENT_IDEA',
  'EXPLAIN',
  'TRANSLATE_SIMPLIFY',
  'TRACK_MONITOR',
  /** First-class Serp lanes — see adaptive discovery cards */
  'EVENTS',
  'FLIGHTS',
  'BUSINESS',
  'TRENDS',
  'MARKET',
  'JOBS',
] as const;

export type PrepIntent = (typeof PREP_INTENTS)[number];

/** Used when classification fails or legacy rows have no `intent`. */
export const FALLBACK_INTENT: PrepIntent = 'RESEARCH';

export const prepIntentSchema = z.enum(
  PREP_INTENTS as unknown as [PrepIntent, ...PrepIntent[]],
);

export const intentClassificationSchema = z.object({
  intent: prepIntentSchema,
});

export type IntentClassification = z.infer<typeof intentClassificationSchema>;

export function parsePrepIntent(raw: string | null | undefined): PrepIntent {
  if (!raw) {
    return FALLBACK_INTENT;
  }
  return (PREP_INTENTS as readonly string[]).includes(raw)
    ? (raw as PrepIntent)
    : FALLBACK_INTENT;
}
