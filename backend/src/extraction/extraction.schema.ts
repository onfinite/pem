import { z } from 'zod';

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
  pem_note: z
    .string()
    .nullable()
    .describe('One or two sentences of helpful context for the detail screen'),
  draft_text: z
    .string()
    .nullable()
    .describe('Copy-ready draft only when clearly requested'),
});

export const extractionResultSchema = z.object({
  polished_text: z
    .string()
    .describe(
      'One clear, well-formed paragraph: rewrite the entire dump in natural order. Preserve meaning; do not add tasks. Not a bullet list.',
    ),
  items: z.array(extractedActionableSchema),
});

export type ExtractedActionable = z.infer<typeof extractedActionableSchema>;
