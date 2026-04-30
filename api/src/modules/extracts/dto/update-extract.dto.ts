import { z } from 'zod';

const isoInstantOrNull = z.union([
  z.null(),
  z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
    message: 'Invalid date string',
  }),
]);

/** Validated in controller via Zod — keep in sync with `ExtractsService.applyUserUpdate`. */
export const updateExtractBodySchema = z
  .object({
    text: z.string().min(1).max(2000).optional(),
    original_text: z.string().max(4000).optional(),
    tone: z.enum(['confident', 'tentative', 'holding']).optional(),
    urgency: z.enum(['holding', 'none']).optional(),
    batch_key: z.enum(['shopping', 'follow_ups']).nullable().optional(),
    due_at: isoInstantOrNull.optional(),
    period_start: isoInstantOrNull.optional(),
    period_end: isoInstantOrNull.optional(),
    period_label: z.string().max(120).nullable().optional(),
    duration_minutes: z
      .number()
      .int()
      .min(0)
      .max(24 * 60)
      .nullable()
      .optional(),
    pem_note: z.string().max(2000).nullable().optional(),
    is_deadline: z.boolean().optional(),
    energy_level: z.enum(['low', 'medium', 'high']).nullable().optional(),
    list_id: z.string().uuid().nullable().optional(),
    priority: z.enum(['high', 'medium', 'low']).nullable().optional(),
    reminder_at: z.string().datetime().nullable().optional(),
  })
  .strict();

export type UpdateExtractBody = z.infer<typeof updateExtractBodySchema>;
