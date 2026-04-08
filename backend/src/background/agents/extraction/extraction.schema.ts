/** Same entrypoint the AI SDK uses — avoids any dual-instance / conversion quirks. */
import { z } from 'zod/v4';

/* ── Shared primitives ─────────────────────────────────── */

export const confidenceSchema = z.enum(['high', 'medium', 'low']);

export type Confidence = z.infer<typeof confidenceSchema>;

const TONE_VALUES = ['confident', 'tentative', 'idea', 'someday'] as const;
const URGENCY_VALUES = ['today', 'this_week', 'someday', 'none'] as const;
const BATCH_VALUES = ['shopping', 'errands', 'follow_ups'] as const;

/** Models often send "" or omit nullable fields — normalize so structured output parses. */
/** No `z.undefined()` in unions — AI SDK JSON Schema cannot represent undefined. */
const nullableText = z
  .union([z.string(), z.null(), z.literal('')])
  .optional()
  .transform((v) => (v == null || v === '' ? null : v));

const toneSchema = z
  .union([z.enum(TONE_VALUES), z.string()])
  .transform((v) =>
    TONE_VALUES.includes(v as (typeof TONE_VALUES)[number])
      ? (v as (typeof TONE_VALUES)[number])
      : 'tentative',
  );

const urgencySchema = z
  .union([z.enum(URGENCY_VALUES), z.string()])
  .transform((v) =>
    URGENCY_VALUES.includes(v as (typeof URGENCY_VALUES)[number])
      ? (v as (typeof URGENCY_VALUES)[number])
      : 'none',
  );

const batchKeySchema = z
  .union([z.enum(BATCH_VALUES), z.null(), z.literal(''), z.string()])
  .optional()
  .transform((v): (typeof BATCH_VALUES)[number] | null => {
    if (v == null || v === '') return null;
    if (BATCH_VALUES.includes(v as (typeof BATCH_VALUES)[number]))
      return v as (typeof BATCH_VALUES)[number];
    return null;
  });

/* ── Phase 1: Extract ──────────────────────────────────── */

export const extractedItemSchema = z.object({
  text: z.string().describe('Clean, short actionable line'),
  original_text: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null ? '' : v))
    .describe('Verbatim fragment from the dump this came from'),
  tone: toneSchema,
  urgency: urgencySchema,
  batch_key: batchKeySchema.describe('Null if not batchable'),
  due_at: nullableText.describe(
    'ISO 8601 datetime in user local offset, or null',
  ),
  period_start: nullableText,
  period_end: nullableText,
  period_label: nullableText,
  recommended_at: nullableText.describe('Soft revisit time; null if none'),
  pem_note: nullableText.describe(
    'One or two sentences of helpful context for the detail screen',
  ),
  draft_text: nullableText.describe(
    'Copy-ready draft only when clearly requested',
  ),
});

export const memoryWriteSchema = z.object({
  memory_key: z.string(),
  note: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => (v == null ? '' : v)),
});

/** Agent 1 output — focused on understanding the dump. */
export const extractPhaseSchema = z.object({
  polished_text: z
    .string()
    .describe(
      'One clear paragraph: grammar and clarity only; preserve meaning; do not add tasks.',
    ),
  new_items: z.array(extractedItemSchema),
  memory_writes: z
    .union([z.array(memoryWriteSchema), z.null()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : [])),
  agent_assumptions: z
    .union([z.array(z.string()), z.null()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : []))
    .describe('Explicit assumptions. Use [] if none.'),
});

export type ExtractPhaseResult = z.infer<typeof extractPhaseSchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

/* ── Phase 2: Reconcile ────────────────────────────────── */

/** Coerce model quirks (wrong case, stray strings) for JSON structured output. */
const reconcileConfidenceSchema = z
  .union([confidenceSchema, z.string()])
  .transform((v): z.infer<typeof confidenceSchema> => {
    const x = typeof v === 'string' ? v.trim().toLowerCase() : v;
    if (x === 'high' || x === 'medium' || x === 'low') return x;
    return 'low';
  });

const reconcilePatchNullable = z
  .union([z.string(), z.null(), z.literal('')])
  .optional()
  .transform((v) => (v == null || v === '' ? null : v));

const reconcileBatchKeyPatch = z
  .union([z.enum(BATCH_VALUES), z.null(), z.literal(''), z.string()])
  .optional()
  .transform((v): (typeof BATCH_VALUES)[number] | null => {
    if (v == null || v === '') return null;
    if (BATCH_VALUES.includes(v as (typeof BATCH_VALUES)[number]))
      return v as (typeof BATCH_VALUES)[number];
    return null;
  });

/** int index or null; models sometimes send string numbers. */
const reconcileNullableIndex = z
  .union([z.number(), z.null(), z.string(), z.literal('')])
  .optional()
  .transform((v): number | null => {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
    if (typeof v === 'string') {
      const n = Number.parseInt(v.trim(), 10);
      return Number.isNaN(n) ? null : n;
    }
    return null;
  });

const reconcileFollowUpNullable = z
  .union([z.string(), z.null(), z.literal('')])
  .optional()
  .transform((v) => (v == null || v === '' ? null : v));

function reconcileTopArray<Inner extends z.ZodTypeAny>(
  inner: Inner,
  desc?: string,
) {
  const arr = z
    .union([z.array(inner), z.null()])
    .optional()
    .transform((v) => (Array.isArray(v) ? v : []));
  return desc ? arr.describe(desc) : arr;
}

export const mergePatchSchema = z.object({
  text: z.string().optional(),
  original_text: z.string().optional(),
  tone: z.enum(['confident', 'tentative', 'idea', 'someday']).optional(),
  urgency: z.enum(['today', 'this_week', 'someday', 'none']).optional(),
  batch_key: reconcileBatchKeyPatch,
  due_at: reconcilePatchNullable,
  period_start: reconcilePatchNullable,
  period_end: reconcilePatchNullable,
  period_label: reconcilePatchNullable,
  recommended_at: reconcilePatchNullable,
  pem_note: reconcilePatchNullable,
  draft_text: reconcilePatchNullable,
});

export const mergeOperationSchema = z.object({
  actionable_id: z.string().uuid(),
  patch: mergePatchSchema,
  agent_log_note: z.string().describe('Why this merge was applied (audit)'),
  confidence: reconcileConfidenceSchema,
});

export const lifecycleCommandSchema = z.object({
  actionable_id: z.string().uuid(),
  command: z.enum(['mark_done', 'dismiss', 'snooze']),
  snooze_until_iso: reconcilePatchNullable.describe(
    'Required when command is snooze',
  ),
  agent_log_note: z.string(),
  confidence: reconcileConfidenceSchema,
});

export const followUpWriteSchema = z.object({
  actionable_id: z.string().uuid(),
  note: reconcileFollowUpNullable,
  recommended_at: reconcileFollowUpNullable,
  agent_log_note: z.string(),
  confidence: reconcileConfidenceSchema,
});

export const calendarWriteSchema = z.object({
  summary: z.string().describe('Event title / summary'),
  start_at: z.string().describe('ISO 8601 event start datetime with offset'),
  end_at: z.string().describe('ISO 8601 event end datetime with offset'),
  location: z
    .string()
    .nullable()
    .optional()
    .describe('Event location if mentioned'),
  description: z.string().nullable().optional().describe('Brief calendar note'),
  new_item_index: reconcileNullableIndex.describe(
    '0-based index into new_items this calendar event corresponds to, or null',
  ),
  agent_log_note: z.string(),
  confidence: reconcileConfidenceSchema,
});

/** Which new_items from Phase 1 are actually duplicates of existing tasks. */
export const deduplicationSchema = z.object({
  new_item_index: z
    .union([z.number(), z.string()])
    .transform((v): number => {
      if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
      const n = Number.parseInt(String(v).trim(), 10);
      return Number.isNaN(n) ? -1 : n;
    })
    .describe('0-based index into the new_items array from Phase 1'),
  existing_id: z.string().uuid().describe('ID of the matching open task'),
  reason: z.string().describe('Why this is a duplicate'),
});

/** Agent 2 output — focused on reconciling against existing state. */
export const reconcilePhaseSchema = z.object({
  merge_operations: reconcileTopArray(
    mergeOperationSchema,
    'Merges against open tasks — use [] if none',
  ),
  lifecycle_commands: reconcileTopArray(
    lifecycleCommandSchema,
    'mark_done / dismiss / snooze — use [] if none',
  ),
  follow_up_writes: reconcileTopArray(
    followUpWriteSchema,
    'Follow-up reminders — use [] if none',
  ),
  calendar_writes: reconcileTopArray(
    calendarWriteSchema,
    'Calendar events — use [] if none',
  ),
  deduplications: reconcileTopArray(
    deduplicationSchema,
    'New items that duplicate open tasks — use [] if none',
  ),
});

export type ReconcilePhaseResult = z.infer<typeof reconcilePhaseSchema>;
export type CalendarWrite = z.infer<typeof calendarWriteSchema>;
export type MergePatch = z.infer<typeof mergePatchSchema>;

/* ── Legacy combined type (used by dump-extract orchestrator) ── */

export type FullPipelineResult = ExtractPhaseResult &
  ReconcilePhaseResult & {
    additional_context: Record<string, unknown> | null;
  };
