/** Same entrypoint the AI SDK uses — avoids any dual-instance / conversion quirks. */
import { z } from 'zod/v4';

export const confidenceSchema = z.enum(['high', 'medium', 'low']);

export const extractedActionableSchema = z.object({
  text: z.string().describe('Clean, short actionable line'),
  original_text: z
    .string()
    .describe('Verbatim fragment from the dump this came from'),
  tone: z.enum(['confident', 'tentative', 'idea', 'someday']),
  urgency: z.enum(['today', 'this_week', 'someday', 'none']),
  batch_key: z
    .enum(['shopping', 'calls', 'emails', 'errands'])
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
    .describe(
      'Soft LLM suggestion for when to revisit this item; null if none. Only when confident.',
    ),
  pem_note: z
    .string()
    .nullable()
    .describe('One or two sentences of helpful context for the detail screen'),
  draft_text: z
    .string()
    .nullable()
    .describe('Copy-ready draft only when clearly requested'),
});

export const mergePatchSchema = z.object({
  text: z.string().optional(),
  original_text: z.string().optional(),
  tone: z.enum(['confident', 'tentative', 'idea', 'someday']).optional(),
  urgency: z.enum(['today', 'this_week', 'someday', 'none']).optional(),
  batch_key: z
    .enum(['shopping', 'calls', 'emails', 'errands'])
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
  agent_log_note: z
    .string()
    .describe('Why this merge was applied (audit; required for agent changes)'),
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

export const memoryWriteSchema = z.object({
  memory_key: z.string(),
  note: z.string(),
});

export const extractionResultSchema = z.object({
  polished_text: z
    .string()
    .describe(
      'One clear paragraph: grammar and clarity only; preserve meaning; do not add tasks.',
    ),
  /**
   * OpenAI structured outputs reject some Zod→JSON-Schema shapes (e.g. object + nullable +
   * optional → anyOf branches that use propertyNames). Context audit is attached server-side.
   */
  agent_assumptions: z
    .array(z.string())
    .describe(
      'Explicit assumptions (date phrasing, merge decisions). Use [] if none.',
    ),
  memory_writes: z.array(memoryWriteSchema),
  new_items: z.array(extractedActionableSchema),
  merge_operations: z.array(mergeOperationSchema),
  lifecycle_commands: z.array(lifecycleCommandSchema),
  follow_up_writes: z.array(followUpWriteSchema),
});

export type ExtractedActionable = z.infer<typeof extractedActionableSchema>;
export type ExtractionResult = z.infer<typeof extractionResultSchema>;
export type Confidence = z.infer<typeof confidenceSchema>;
export type MergePatch = z.infer<typeof mergePatchSchema>;
