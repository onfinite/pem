/** Same entrypoint the AI SDK uses — avoids any dual-instance / conversion quirks. */
import { z } from 'zod/v4';

/* ── Shared primitives ─────────────────────────────────── */

export const confidenceSchema = z.enum(['high', 'medium', 'low']);

export type Confidence = z.infer<typeof confidenceSchema>;

/* ── Phase 1: Extract ──────────────────────────────────── */

export const extractedItemSchema = z.object({
  text: z.string().describe('Clean, short actionable line'),
  original_text: z
    .string()
    .describe('Verbatim fragment from the dump this came from'),
  tone: z.enum(['confident', 'tentative', 'idea', 'someday']),
  urgency: z.enum(['today', 'this_week', 'someday', 'none']),
  batch_key: z
    .enum(['shopping', 'errands', 'follow_ups'])
    .nullable()
    .describe('Null if not batchable'),
  due_at: z
    .string()
    .nullable()
    .describe('ISO 8601 datetime in user local offset, or null'),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  period_label: z.string().nullable(),
  recommended_at: z
    .string()
    .nullable()
    .describe('Soft revisit time; null if none'),
  pem_note: z
    .string()
    .nullable()
    .describe('One or two sentences of helpful context for the detail screen'),
  draft_text: z
    .string()
    .nullable()
    .describe('Copy-ready draft only when clearly requested'),
});

export const memoryWriteSchema = z.object({
  memory_key: z.string(),
  note: z.string(),
});

/** Agent 1 output — focused on understanding the dump. */
export const extractPhaseSchema = z.object({
  polished_text: z
    .string()
    .describe(
      'One clear paragraph: grammar and clarity only; preserve meaning; do not add tasks.',
    ),
  new_items: z.array(extractedItemSchema),
  memory_writes: z.array(memoryWriteSchema),
  agent_assumptions: z
    .array(z.string())
    .describe('Explicit assumptions. Use [] if none.'),
});

export type ExtractPhaseResult = z.infer<typeof extractPhaseSchema>;
export type ExtractedItem = z.infer<typeof extractedItemSchema>;

/* ── Phase 2: Reconcile ────────────────────────────────── */

export const mergePatchSchema = z.object({
  text: z.string().optional(),
  original_text: z.string().optional(),
  tone: z.enum(['confident', 'tentative', 'idea', 'someday']).optional(),
  urgency: z.enum(['today', 'this_week', 'someday', 'none']).optional(),
  batch_key: z
    .enum(['shopping', 'errands', 'follow_ups'])
    .nullable()
    .optional(),
  due_at: z.string().nullable().optional(),
  period_start: z.string().nullable().optional(),
  period_end: z.string().nullable().optional(),
  period_label: z.string().nullable().optional(),
  recommended_at: z.string().nullable().optional(),
  pem_note: z.string().nullable().optional(),
  draft_text: z.string().nullable().optional(),
});

export const mergeOperationSchema = z.object({
  actionable_id: z.string().uuid(),
  patch: mergePatchSchema,
  agent_log_note: z.string().describe('Why this merge was applied (audit)'),
  confidence: confidenceSchema,
});

export const lifecycleCommandSchema = z.object({
  actionable_id: z.string().uuid(),
  command: z.enum(['mark_done', 'dismiss', 'snooze']),
  snooze_until_iso: z
    .string()
    .nullable()
    .optional()
    .describe('Required when command is snooze'),
  agent_log_note: z.string(),
  confidence: confidenceSchema,
});

export const followUpWriteSchema = z.object({
  actionable_id: z.string().uuid(),
  note: z.string().nullable(),
  recommended_at: z.string().nullable(),
  agent_log_note: z.string(),
  confidence: confidenceSchema,
});

export const calendarWriteSchema = z.object({
  summary: z.string().describe('Event title / summary'),
  start_at: z.string().describe('ISO 8601 event start datetime with offset'),
  end_at: z.string().describe('ISO 8601 event end datetime with offset'),
  location: z.string().nullish().describe('Event location if mentioned'),
  description: z.string().nullish().describe('Brief calendar note'),
  new_item_index: z
    .number()
    .nullable()
    .describe(
      '0-based index into new_items this calendar event corresponds to, or null',
    ),
  agent_log_note: z.string(),
  confidence: confidenceSchema,
});

/** Which new_items from Phase 1 are actually duplicates of existing tasks. */
export const deduplicationSchema = z.object({
  new_item_index: z
    .number()
    .describe('0-based index into the new_items array from Phase 1'),
  existing_id: z.string().uuid().describe('ID of the matching open task'),
  reason: z.string().describe('Why this is a duplicate'),
});

/** Agent 2 output — focused on reconciling against existing state. */
export const reconcilePhaseSchema = z.object({
  merge_operations: z.array(mergeOperationSchema),
  lifecycle_commands: z.array(lifecycleCommandSchema),
  follow_up_writes: z.array(followUpWriteSchema),
  calendar_writes: z.array(calendarWriteSchema),
  deduplications: z
    .array(deduplicationSchema)
    .describe(
      'New items that are duplicates of existing tasks — skip creation',
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
