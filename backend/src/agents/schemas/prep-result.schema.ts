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

const stepRowSchema = z.object({
  number: z.coerce.number(),
  title: z.string(),
  detail: z.string(),
});

const tipItemSchema = z.object({
  text: z.string(),
  isWarning: z.boolean(),
});

const comparisonRowSchema = z.object({
  label: z.string(),
  values: z.array(z.string()),
  recommended: z.boolean(),
});

const sourceChipSchema = z.object({
  title: z.string(),
  url: z.string(),
  domain: z.string(),
});

const suggestedToolSchema = z.object({
  name: z.string(),
  url: z.string(),
});

/**
 * Strict block shapes (runtime validation after the model responds).
 * Kept as a discriminated union for typing — not used for OpenAI JSON schema
 * (API rejects `oneOf` inside `blocks.items` for structured outputs).
 */
export const prepBlockSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('summary'),
    text: z.string(),
  }),
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
    recipientHint: z.string().optional(),
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
  z.object({
    type: z.literal('pros_cons'),
    pros: z.array(z.string()),
    cons: z.array(z.string()),
    verdict: z.string().optional(),
  }),
  z.object({
    type: z.literal('action_steps'),
    steps: z.array(stepRowSchema),
  }),
  z.object({
    type: z.literal('tips'),
    tips: z.array(tipItemSchema),
  }),
  z.object({
    type: z.literal('comparison'),
    headers: z.array(z.string()),
    rows: z.array(comparisonRowSchema),
  }),
  z.object({
    type: z.literal('limitations'),
    cannotDo: z.string(),
    canDo: z.array(z.string()),
    suggestedTools: z.array(suggestedToolSchema).optional(),
  }),
  z.object({
    type: z.literal('sources'),
    sources: z.array(sourceChipSchema),
  }),
  z.object({
    type: z.literal('follow_up'),
    question: z.string(),
    prefill: z.string().optional(),
  }),
]);

export type PrepBlock = z.infer<typeof prepBlockSchema>;

export const primaryKindSchema = z.enum([
  'search',
  'research',
  'options',
  'draft',
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
    'summary',
    'pros_cons',
    'action_steps',
    'tips',
    'comparison',
    'limitations',
    'sources',
    'follow_up',
  ]),
  answer: z.string(),
  sources: z.array(z.string()),
  summary: z.string(),
  keyPoints: z.array(z.string()),
  options: z.array(optionRowSchema).max(3),
  subject: z.string(),
  body: z.string(),
  tone: z.string(),
  title: z.string(),
  /** Summary block body (2–3 sentences on detail). */
  text: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
  verdict: z.string(),
  steps: z.array(stepRowSchema).max(7),
  tipItems: z.array(tipItemSchema).max(4),
  headers: z.array(z.string()).max(4),
  comparisonRows: z.array(comparisonRowSchema).max(5),
  cannotDo: z.string(),
  canDo: z.array(z.string()),
  suggestedTools: z.array(suggestedToolSchema).max(5),
  /** Rich source chips for `sources` block only (not string[] URLs). */
  sourceChips: z.array(sourceChipSchema).max(8),
  followUpQuestion: z.string(),
  followUpPrefill: z.string(),
  recipientHint: z.string(),
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
    case 'draft': {
      const hint = raw.recipientHint.trim();
      return prepBlockSchema.parse({
        type: 'draft',
        subject: raw.subject.trim() === '' ? null : raw.subject,
        body: raw.body,
        tone: raw.tone,
        ...(hint ? { recipientHint: hint } : {}),
      });
    }
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
    case 'summary':
      return prepBlockSchema.parse({
        type: 'summary',
        text: raw.text,
      });
    case 'pros_cons':
      return prepBlockSchema.parse({
        type: 'pros_cons',
        pros: raw.pros.slice(0, 4),
        cons: raw.cons.slice(0, 4),
        verdict: raw.verdict.trim() ? raw.verdict.trim() : undefined,
      });
    case 'action_steps':
      return prepBlockSchema.parse({
        type: 'action_steps',
        steps: raw.steps.slice(0, 7),
      });
    case 'tips':
      return prepBlockSchema.parse({
        type: 'tips',
        tips: raw.tipItems.slice(0, 4),
      });
    case 'comparison':
      return prepBlockSchema.parse({
        type: 'comparison',
        headers: raw.headers.slice(0, 4),
        rows: raw.comparisonRows.slice(0, 5),
      });
    case 'limitations': {
      const tools = raw.suggestedTools.filter((t) => t.name.trim());
      return prepBlockSchema.parse({
        type: 'limitations',
        cannotDo: raw.cannotDo,
        canDo: raw.canDo.filter((s) => s.trim()),
        suggestedTools: tools.length ? tools : undefined,
      });
    }
    case 'sources':
      return prepBlockSchema.parse({
        type: 'sources',
        sources: raw.sourceChips.filter((s) => s.url.trim()),
      });
    case 'follow_up':
      return prepBlockSchema.parse({
        type: 'follow_up',
        question: raw.followUpQuestion,
        prefill: raw.followUpPrefill.trim()
          ? raw.followUpPrefill.trim()
          : undefined,
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
  const blocks = raw.blocks.map(normalizePrepBlock);
  return {
    summary: raw.summary,
    primaryKind: raw.primaryKind,
    blocks,
  };
}
