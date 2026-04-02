import { z } from 'zod';

/**
 * Prep `result` JSON — OpenAI structured outputs need explicit types per field.
 */
export const prepResultSchema = z.union([
  z.object({
    answer: z.string(),
    sources: z.array(z.string()),
  }),
  z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
    sources: z.array(z.string()),
  }),
  z.object({
    options: z
      .array(
        z.object({
          name: z.string(),
          price: z.string(),
          url: z.string(),
          store: z.string(),
          why: z.string(),
          imageUrl: z.string(),
        }),
      )
      .max(3),
  }),
  z.object({
    subject: z.string().nullable(),
    body: z.string(),
    tone: z.string(),
  }),
  z.object({
    sections: z.array(
      z.object({
        type: z.string(),
        body: z.string(),
      }),
    ),
  }),
]);

export const structureSchema = z.object({
  summary: z.string(),
  renderType: z.enum(['search', 'research', 'options', 'draft', 'compound']),
  result: prepResultSchema,
});
