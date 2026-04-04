import { z } from 'zod';

/** Real URLs and numbers only from agent output — never invented. */
const shoppingProductSchema = z.object({
  name: z.string(),
  price: z.string(),
  /** 0–5 when unknown use 0 */
  rating: z.number(),
  image: z.string(),
  url: z.string(),
  store: z.string(),
  why: z.string(),
  /** "" when none */
  badge: z.string(),
  pros: z.array(z.string()),
  cons: z.array(z.string()),
});

/**
 * Structured output for SHOPPING intent — matches `pem-adaptive-prep-cards.mdc` SHOPPING_CARD.
 * OpenAI: all keys required; arrays may be empty.
 */
export const shoppingCardModelSchema = z.object({
  summary: z.string(),
  query: z.string(),
  recommendation: z.string(),
  buyingGuide: z.string(),
  products: z.array(shoppingProductSchema).min(1).max(3),
});

export type ShoppingCardModelOutput = z.infer<typeof shoppingCardModelSchema>;

export type ShoppingCardPayload = ShoppingCardModelOutput & {
  schema: 'SHOPPING_CARD';
};

const DRAFT_TYPES = ['email', 'message', 'post', 'proposal', 'other'] as const;
const DRAFT_TONES = ['professional', 'casual', 'friendly', 'firm'] as const;

export const draftCardModelSchema = z.object({
  summary: z.string(),
  draftType: z.enum(DRAFT_TYPES),
  /** Use "" when no subject */
  subject: z.string(),
  body: z.string(),
  tone: z.enum(DRAFT_TONES),
  /** What Pem assumed — "" if none */
  assumptions: z.string(),
});

export type DraftCardModelOutput = z.infer<typeof draftCardModelSchema>;

export type DraftCardPayload = DraftCardModelOutput & {
  schema: 'DRAFT_CARD';
};

export function normalizeShoppingCard(
  raw: ShoppingCardModelOutput,
): ShoppingCardPayload {
  const products = raw.products.slice(0, 3).map((p) => ({
    ...p,
    name: p.name.trim(),
    price: p.price.trim(),
    image: p.image.trim(),
    url: p.url.trim(),
    store: p.store.trim(),
    why: p.why.trim(),
    badge: p.badge.trim(),
    pros: p.pros.map((s) => s.trim()).filter(Boolean),
    cons: p.cons.map((s) => s.trim()).filter(Boolean),
    rating: Math.min(5, Math.max(0, p.rating)),
  }));
  return {
    schema: 'SHOPPING_CARD',
    summary: raw.summary.trim(),
    query: raw.query.trim(),
    recommendation: raw.recommendation.trim(),
    buyingGuide: raw.buyingGuide.trim(),
    products,
  };
}

export function normalizeDraftCard(
  raw: DraftCardModelOutput,
): DraftCardPayload {
  const subject = raw.subject.trim();
  return {
    schema: 'DRAFT_CARD',
    summary: raw.summary.trim(),
    draftType: raw.draftType,
    subject,
    body: raw.body.trim(),
    tone: raw.tone,
    assumptions: raw.assumptions.trim(),
  };
}
