import { z } from 'zod';

/** One product row (options block). */
const optionRowSchema = z.object({
  name: z.string(),
  price: z.string(),
  url: z.string(),
  store: z.string(),
  why: z.string(),
  imageUrl: z.string(),
});

/**
 * Strict block shapes (runtime validation after the model responds).
 * Kept as a discriminated union for typing — not used for OpenAI JSON schema
 * (API rejects `oneOf` inside `blocks.items` for structured outputs).
 */
export const prepBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('search'),
    answer: z.string(),
    sources: z.array(z.string()),
  }),
  z.object({
    type: z.literal('research'),
    summary: z.string(),
    keyPoints: z.array(z.string()),
    sources: z.array(z.string()),
  }),
  z.object({
    type: z.literal('options'),
    options: z.array(optionRowSchema).max(3),
  }),
  z.object({
    type: z.literal('draft'),
    subject: z.string().nullable(),
    body: z.string(),
    tone: z.string(),
  }),
  z.object({
    type: z.literal('guidance'),
    title: z.string().optional(),
    body: z.string(),
  }),
  z.object({
    type: z.literal('limitation'),
    title: z.string().optional(),
    body: z.string(),
  }),
]);

export type PrepBlock = z.infer<typeof prepBlockSchema>;

export const primaryKindSchema = z.enum([
  'search',
  'research',
  'options',
  'draft',
  'mixed',
]);

export type PrimaryKind = z.infer<typeof primaryKindSchema>;

/**
 * Flat block object for the mini-model: single `properties` object, no `oneOf`.
 * OpenAI structured outputs require **every** property key to appear in `required`
 * (no optional keys). Unused fields must still be sent: "", [], or null.
 * We normalize to `PrepBlock` after.
 */
export const prepBlockLooseSchema = z.object({
  type: z.enum([
    'search',
    'research',
    'options',
    'draft',
    'guidance',
    'limitation',
  ]),
  answer: z.string(),
  sources: z.array(z.string()),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  options: z.array(optionRowSchema).max(3),
  /** Use \`""\` when no subject; draft blocks normalize empty string to \`null\`. */
  subject: z.string(),
  body: z.string(),
  tone: z.string(),
  title: z.string(),
});

/** Use with `Output.object` / OpenAI structured outputs (no discriminated union). */
export const structureModelSchema = z.object({
  summary: z.string(),
  primaryKind: primaryKindSchema,
  blocks: z.array(prepBlockLooseSchema).min(1),
});

export type StructuredPrepOutput = {
  summary: string;
  primaryKind: PrimaryKind;
  blocks: PrepBlock[];
};

export type StructuredPrepModelOutput = z.infer<typeof structureModelSchema>;

function normalizePrepBlock(
  raw: z.infer<typeof prepBlockLooseSchema>,
): PrepBlock {
  switch (raw.type) {
    case 'search':
      return prepBlockSchema.parse({
        type: 'search',
        answer: raw.answer,
        sources: raw.sources,
      });
    case 'research':
      return prepBlockSchema.parse({
        type: 'research',
        summary: raw.summary,
        keyPoints: raw.keyPoints,
        sources: raw.sources,
      });
    case 'options':
      return prepBlockSchema.parse({
        type: 'options',
        options: raw.options.slice(0, 3),
      });
    case 'draft':
      return prepBlockSchema.parse({
        type: 'draft',
        subject: raw.subject.trim() === '' ? null : raw.subject,
        body: raw.body,
        tone: raw.tone,
      });
    case 'guidance':
      return prepBlockSchema.parse({
        type: 'guidance',
        title: raw.title.trim() ? raw.title.trim() : undefined,
        body: raw.body,
      });
    case 'limitation':
      return prepBlockSchema.parse({
        type: 'limitation',
        title: raw.title.trim() ? raw.title.trim() : undefined,
        body: raw.body,
      });
    default:
      throw new Error(
        `Unknown block type: ${String((raw as { type?: string }).type)}`,
      );
  }
}

/** Turn loose model output into validated `PrepBlock[]`. */
export function normalizeStructuredPrepOutput(
  raw: StructuredPrepModelOutput,
): StructuredPrepOutput {
  return {
    summary: raw.summary,
    primaryKind: raw.primaryKind,
    blocks: raw.blocks.map(normalizePrepBlock),
  };
}
