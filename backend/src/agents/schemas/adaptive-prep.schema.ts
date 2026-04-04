import { z } from 'zod';

import { upgradeGoogleImageSize } from '../../integrations/serpapi-image-url';
import { sanitizeShoppingProductUrl } from './shopping-product-url';

/** Real URLs and numbers only from agent output — never invented. */
const shoppingProductSchema = z.object({
  name: z.string(),
  price: z.string(),
  /** 0–5 when unknown use 0 */
  rating: z.number(),
  /** Count of reviews when known; else 0 */
  reviewCount: z.number(),
  /** One short quote or paraphrase from reviews; "" if none */
  reviewSnippet: z.string(),
  /** One line on buyer sentiment (e.g. "Loved for battery life"); "" if none */
  customerSentiment: z.string(),
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
  /** Top 3 are hero carousel in the app; up to 7 more render as a vertical list (max 10 total). */
  products: z.array(shoppingProductSchema).min(1).max(10),
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
  const products = raw.products.slice(0, 10).map((p) => ({
    ...p,
    name: p.name.trim(),
    price: p.price.trim(),
    image: upgradeGoogleImageSize(p.image.trim()),
    url: sanitizeShoppingProductUrl(p.url),
    store: p.store.trim(),
    why: p.why.trim(),
    badge: p.badge.trim(),
    pros: p.pros.map((s) => s.trim()).filter(Boolean),
    cons: p.cons.map((s) => s.trim()).filter(Boolean),
    rating: Math.min(5, Math.max(0, p.rating)),
    reviewCount: Math.max(0, Math.floor(p.reviewCount)),
    reviewSnippet: p.reviewSnippet.trim(),
    customerSentiment: p.customerSentiment.trim(),
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

const placeRowSchema = z.object({
  name: z.string(),
  address: z.string(),
  rating: z.number(),
  reviewCount: z.number(),
  photo: z.string(),
  lat: z.number(),
  lng: z.number(),
  priceRange: z.string(),
  hours: z.string(),
  phone: z.string(),
  /** Business site from Serp/maps when present — not the same as Maps URL in `url`. */
  website: z.string(),
  /** Only when explicitly in sources; maps SERP rarely includes email — use "" otherwise. */
  email: z.string(),
  /** Google Maps place link when available; "" if none. */
  url: z.string(),
  /** Short paraphrase from reviews / forums when available; "" if none */
  reviewSnippet: z.string(),
  /** One line on reputation / satisfaction; "" if none */
  customerSatisfaction: z.string(),
  pemNote: z.string(),
});

export const placeCardModelSchema = z.object({
  summary: z.string(),
  query: z.string(),
  recommendation: z.string(),
  places: z.array(placeRowSchema).min(1).max(5),
  mapCenterLat: z.number(),
  mapCenterLng: z.number(),
});

export type PlaceCardModelOutput = z.infer<typeof placeCardModelSchema>;

export type PlaceCardPayload = PlaceCardModelOutput & {
  schema: 'PLACE_CARD';
};

export function normalizePlaceCard(
  raw: PlaceCardModelOutput,
): PlaceCardPayload {
  const places = raw.places.slice(0, 5).map((p) => ({
    ...p,
    name: p.name.trim(),
    address: p.address.trim(),
    photo: upgradeGoogleImageSize(p.photo.trim()),
    priceRange: p.priceRange.trim(),
    hours: p.hours.trim(),
    phone: p.phone.trim(),
    website: p.website.trim(),
    email: p.email.trim(),
    url: p.url.trim(),
    reviewSnippet: p.reviewSnippet.trim(),
    customerSatisfaction: p.customerSatisfaction.trim(),
    pemNote: p.pemNote.trim(),
    rating: Math.min(5, Math.max(0, p.rating)),
    reviewCount: Math.max(0, Math.floor(p.reviewCount)),
    lat: p.lat,
    lng: p.lng,
  }));
  let mapCenterLat = raw.mapCenterLat;
  let mapCenterLng = raw.mapCenterLng;
  const withGps = places.filter((p) => p.lat !== 0 && p.lng !== 0);
  if (withGps.length > 0) {
    mapCenterLat = withGps.reduce((s, p) => s + p.lat, 0) / withGps.length;
    mapCenterLng = withGps.reduce((s, p) => s + p.lng, 0) / withGps.length;
  }
  return {
    schema: 'PLACE_CARD',
    summary: raw.summary.trim(),
    query: raw.query.trim(),
    recommendation: raw.recommendation.trim(),
    places,
    mapCenterLat,
    mapCenterLng,
  };
}
