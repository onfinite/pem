import { Logger } from '@nestjs/common';
import { z } from 'zod';

import { logWithContext } from '@/core/utils/format-log-context';

const schemaLog = new Logger('PemAgentSchema');

function enumWithDefault<T extends string>(
  values: readonly [T, ...T[]],
  fallback: T,
  label: string,
) {
  return z.preprocess((v) => {
    if (typeof v === 'string' && (values as readonly string[]).includes(v))
      return v;
    if (v !== undefined && v !== null) {
      const repr =
        typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint'
          ? String(v)
          : typeof v === 'string'
            ? v
            : 'non-scalar';
      schemaLog.warn(
        logWithContext('Invalid enum value — defaulting', {
          scope: 'pemAgent.schema',
          field: label,
          got: repr,
          fallback,
        }),
      );
    }
    return fallback;
  }, z.enum(values));
}

const nullStr = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const toneEnum = enumWithDefault(
  ['confident', 'tentative', 'holding'],
  'confident',
  'tone',
);
const urgencyEnum = enumWithDefault(['holding', 'none'], 'none', 'urgency');
const batchEnum = z.preprocess(
  (v) => (v === 'errands' ? null : v),
  z
    .enum(['shopping', 'follow_ups'])
    .nullish()
    .transform((v) => v ?? null),
);
const priorityEnum = z
  .enum(['high', 'medium', 'low'])
  .nullish()
  .transform((v) => v ?? null);

export const extractActionSchema = z.object({
  text: z
    .preprocess((v) => {
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      return '';
    }, z.string().min(1))
    .describe('Clean, concise task text'),
  original_text: z
    .preprocess((v) => {
      if (typeof v === 'string') return v;
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      return '';
    }, z.string())
    .describe('Raw fragment from the message'),
  tone: toneEnum,
  urgency: urgencyEnum,
  batch_key: batchEnum,
  list_name: nullStr.describe(
    'Name of user list to assign (e.g. "Shopping", "Errands", or a user-created list). null if no list.',
  ),
  create_list: z
    .boolean()
    .default(false)
    .describe('true if user explicitly asks to create a new list/project'),
  priority: priorityEnum.describe(
    'high/medium/low or null. Only set when user signals priority explicitly.',
  ),
  due_at: nullStr.describe('ISO datetime if detected'),
  period_start: nullStr,
  period_end: nullStr,
  period_label: nullStr,
  pem_note: nullStr.describe(
    'Short context note from Pem shown on task detail — e.g. "Annual checkup", "Kane prefers mornings". Write as Pem speaking about the user by their name (never say "User"). Omit if no useful context beyond the task text.',
  ),
  draft_text: nullStr.describe('Draft message for contact-related tasks'),
});

export const updateActionSchema = z.object({
  extract_id: z.string().describe('ID of existing extract to update'),
  patch: z
    .object({
      text: z.string().optional(),
      tone: toneEnum.optional(),
      urgency: urgencyEnum.optional(),
      batch_key: batchEnum.optional(),
      list_name: nullStr
        .optional()
        .describe('List name to move to, or null to remove from current list'),
      create_list: z
        .boolean()
        .default(false)
        .describe('true if list_name is a new list that should be created'),
      priority: priorityEnum.optional(),
      due_at: nullStr.optional(),
      period_start: nullStr.optional(),
      period_end: nullStr.optional(),
      period_label: nullStr.optional(),
      pem_note: nullStr.optional(),
      draft_text: nullStr.optional(),
      event_start_at: nullStr
        .optional()
        .describe('New event start ISO datetime if rescheduling'),
      event_end_at: nullStr
        .optional()
        .describe('New event end ISO datetime if rescheduling'),
    })
    .describe(
      'ONLY include fields the user asked to change. Omit everything else — omitted fields stay unchanged.',
    ),
  reason: z.string().default(''),
});

const completionCommandSchema = z.preprocess(
  (v) => {
    if (v === 'mark_done' || v === 'dismiss') return 'close';
    return v;
  },
  z.enum(['close', 'snooze', 'reopen']),
);

export const completeActionSchema = z.object({
  extract_id: z.string(),
  command: completionCommandSchema,
  snooze_until_iso: nullStr.optional(),
  reason: z.string().default(''),
});

const attendeeSchema = z.object({
  email: z.string().min(1),
  name: nullStr.optional(),
});

export const calendarWriteSchema = z.object({
  summary: z.string().min(1),
  start_at: z.string().describe('ISO datetime'),
  end_at: z.string().describe('ISO datetime'),
  is_all_day: z
    .union([z.boolean(), z.string().transform((v) => v === 'true')])
    .optional()
    .default(false)
    .describe(
      'True for vacations, holidays, multi-day events with no specific time',
    ),
  reminder_minutes: z.coerce
    .number()
    .optional()
    .describe(
      'Custom popup reminder N minutes before. Omit to use calendar defaults.',
    ),
  location: nullStr.optional(),
  description: nullStr.optional(),
  attendees: z
    .array(attendeeSchema)
    .optional()
    .default([])
    .describe('Guests to invite — use emails from ## Contacts only'),
  linked_new_item_index: z
    .number()
    .nullish()
    .transform((v) => v ?? null),
});

export const calendarUpdateSchema = z.object({
  extract_id: z
    .string()
    .describe('ID of the extract linked to the calendar event to update'),
  summary: z.string().optional(),
  start_at: z.string().optional().describe('New ISO start datetime'),
  end_at: z.string().optional().describe('New ISO end datetime'),
  location: nullStr.optional(),
  description: nullStr.optional(),
  attendees: z
    .array(attendeeSchema)
    .optional()
    .describe('Add or replace guests — use emails from ## Contacts only'),
});

export const calendarDeleteSchema = z.object({
  extract_id: z
    .string()
    .describe('ID of the extract linked to the calendar event to delete'),
  reason: z.string().default(''),
});

export const schedulingSchema = z.object({
  create_index: z.number(),
  scheduled_at: z.string().describe('ISO datetime in user timezone'),
  duration_minutes: z.number().default(30),
  reasoning: z.string(),
});

/** Models often emit null for omitted numeric fields; optional() rejects null. */
const recurrenceRuleSchema = z.object({
  freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  interval: z
    .number()
    .nullish()
    .transform((v) => (typeof v === 'number' && v >= 1 ? v : 1)),
  by_day: z
    .array(z.number())
    .nullish()
    .transform((v) => v ?? undefined),
  by_month_day: z
    .number()
    .nullish()
    .transform((v) => v ?? undefined),
  until: z
    .string()
    .nullish()
    .transform((v) => v ?? undefined),
  count: z
    .number()
    .nullish()
    .transform((v) => v ?? undefined),
});

export const recurrenceDetectionSchema = z.object({
  create_index: z.number(),
  rule: recurrenceRuleSchema,
});

export function coerceOrchestrationSummaryUpdate(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const joined = v
      .map((item) => String(item).trim())
      .filter(Boolean)
      .join('\n');
    return joined.length ? joined : null;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    return s.length ? s : null;
  }
  return null;
}

export const rsvpActionSchema = z.object({
  extract_id: z.string(),
  response: z.enum(['accepted', 'declined', 'tentative']),
});

export const memoryWriteSchema = z.object({
  memory_key: z.string().default('general'),
  note: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null ? '' : String(v).trim())),
});

/** Phase 1 (prompt chaining): structured task mutations only — higher reliability than one giant call. */
export const pemExtractionOutputSchema = z.object({
  creates: z.array(extractActionSchema).max(10).default([]),
  updates: z.array(updateActionSchema).max(10).default([]),
  completions: z.array(completeActionSchema).max(10).default([]),
});

/** Phase 2: reply, calendar, memory, scheduling — indices reference phase-1 creates[]. */
export const pemOrchestrationOutputSchema = z.object({
  response_text: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const s = v == null ? '' : String(v).trim();
      return s.length > 0 ? s : 'Got it.';
    })
    .describe(
      "Pem's conversational response to the user. Natural, warm, concise. No markdown.",
    ),
  calendar_writes: z.array(calendarWriteSchema).max(5).default([]),
  memory_writes: z.array(memoryWriteSchema).max(10).default([]),
  calendar_updates: z.array(calendarUpdateSchema).max(5).default([]),
  calendar_deletes: z.array(calendarDeleteSchema).max(3).default([]),
  scheduling: z.array(schedulingSchema).max(10).default([]),
  recurrence_detections: z.array(recurrenceDetectionSchema).max(10).default([]),
  rsvp_actions: z.array(rsvpActionSchema).max(5).default([]),
  summary_update: z
    .union([z.string(), z.array(z.string())])
    .nullish()
    .transform((v) => coerceOrchestrationSummaryUpdate(v))
    .describe(
      'If the user revealed important life context (goals, visions, relationships, preferences, worries, habits, life situation), provide ONLY the new information learned from this message. Do NOT repeat the existing summary — just the new facts. Keep under 200 tokens. The system merges this into the existing profile automatically. MUST be one string (never an array of bullets).',
    ),
  polished_text: nullStr.describe(
    'Cleaned up version of the user message for the thought log. For voice messages over 500 words, write a 2-3 sentence summary of what the user said — not a cleaned transcript.',
  ),
  detected_theme: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null))
    .describe(
      'If this dump connects to a recurring pattern across past messages, name the theme in 1-2 words (e.g. "finances", "work stress", "health"). Null if no clear pattern.',
    ),
});

export const pemAgentOutputSchema = pemExtractionOutputSchema.merge(
  pemOrchestrationOutputSchema,
);

export type PemAgentOutput = z.infer<typeof pemAgentOutputSchema>;
export type PemExtractionOutput = z.infer<typeof pemExtractionOutputSchema>;
export type PemOrchestrationOutput = z.infer<
  typeof pemOrchestrationOutputSchema
>;
export type ExtractAction = z.infer<typeof extractActionSchema>;
