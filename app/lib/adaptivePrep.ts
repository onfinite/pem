/**
 * Adaptive card payloads from `result.schema` — mirrors backend `adaptive-prep.schema.ts`.
 */

export type ShoppingProduct = {
  name: string;
  price: string;
  rating: number;
  image: string;
  url: string;
  store: string;
  why: string;
  badge: string;
  pros: string[];
  cons: string[];
};

export type ShoppingCardPayload = {
  schema: "SHOPPING_CARD";
  summary: string;
  query: string;
  recommendation: string;
  buyingGuide: string;
  products: ShoppingProduct[];
};

export type DraftCardPayload = {
  schema: "DRAFT_CARD";
  summary: string;
  draftType: "email" | "message" | "post" | "proposal" | "other";
  subject: string;
  body: string;
  tone: "professional" | "casual" | "friendly" | "firm";
  assumptions: string;
};

function isRecord(x: unknown): x is Record<string, unknown> {
  return x !== null && typeof x === "object" && !Array.isArray(x);
}

function parseProduct(o: unknown): ShoppingProduct | null {
  if (!isRecord(o)) return null;
  const pros = Array.isArray(o.pros) ? o.pros.filter((x): x is string => typeof x === "string") : [];
  const cons = Array.isArray(o.cons) ? o.cons.filter((x): x is string => typeof x === "string") : [];
  return {
    name: typeof o.name === "string" ? o.name : "",
    price: typeof o.price === "string" ? o.price : "",
    rating: typeof o.rating === "number" && !Number.isNaN(o.rating) ? o.rating : 0,
    image: typeof o.image === "string" ? o.image : "",
    url: typeof o.url === "string" ? o.url : "",
    store: typeof o.store === "string" ? o.store : "",
    why: typeof o.why === "string" ? o.why : "",
    badge: typeof o.badge === "string" ? o.badge : "",
    pros,
    cons,
  };
}

/** Parse adaptive payloads from API `result` (no blocks). */
export function parseAdaptiveFromResult(
  result: Record<string, unknown> | null | undefined,
): { shoppingCard?: ShoppingCardPayload; draftCard?: DraftCardPayload } {
  if (!result || typeof result.schema !== "string") {
    return {};
  }
  if (result.schema === "SHOPPING_CARD") {
    const productsRaw = Array.isArray(result.products) ? result.products : [];
    const products = productsRaw.map(parseProduct).filter((p): p is ShoppingProduct => p !== null && p.name.length > 0);
    if (!products.length) return {};
    return {
      shoppingCard: {
        schema: "SHOPPING_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        query: typeof result.query === "string" ? result.query : "",
        recommendation: typeof result.recommendation === "string" ? result.recommendation : "",
        buyingGuide: typeof result.buyingGuide === "string" ? result.buyingGuide : "",
        products: products.slice(0, 3),
      },
    };
  }
  if (result.schema === "DRAFT_CARD") {
    const body = typeof result.body === "string" ? result.body : "";
    if (!body.trim()) return {};
    const draftType = result.draftType;
    const tone = result.tone;
    return {
      draftCard: {
        schema: "DRAFT_CARD",
        summary: typeof result.summary === "string" ? result.summary : "",
        draftType:
          draftType === "email" ||
          draftType === "message" ||
          draftType === "post" ||
          draftType === "proposal" ||
          draftType === "other"
            ? draftType
            : "other",
        subject: typeof result.subject === "string" ? result.subject : "",
        body,
        tone:
          tone === "professional" || tone === "casual" || tone === "friendly" || tone === "firm"
            ? tone
            : "professional",
        assumptions: typeof result.assumptions === "string" ? result.assumptions : "",
      },
    };
  }
  return {};
}
