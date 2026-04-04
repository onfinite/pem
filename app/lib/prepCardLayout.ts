/**
 * Adaptive card layouts — derived only from `result.schema` (never a separate DB column).
 * Mirrors backend `prep-runner-adaptive` schema labels.
 */

export type CardLayoutId =
  | "shopping_card"
  | "draft_card"
  | "place_card"
  | "comparison_card"
  | "research_card"
  | "person_card"
  | "meeting_brief_card"
  | "decision_card"
  | "legal_financial_card"
  | "explain_card"
  | "summary_card"
  | "idea_cards_card"
  | "events_card"
  | "flights_card"
  | "business_card"
  | "trends_card"
  | "market_card"
  | "jobs_card";

const SCHEMA_TO_LAYOUT: Record<string, CardLayoutId> = {
  SHOPPING_CARD: "shopping_card",
  DRAFT_CARD: "draft_card",
  PLACE_CARD: "place_card",
  COMPARISON_CARD: "comparison_card",
  RESEARCH_CARD: "research_card",
  PERSON_CARD: "person_card",
  MEETING_BRIEF: "meeting_brief_card",
  DECISION_CARD: "decision_card",
  LEGAL_FINANCIAL_CARD: "legal_financial_card",
  EXPLAIN_CARD: "explain_card",
  SUMMARY_CARD: "summary_card",
  IDEA_CARDS: "idea_cards_card",
  EVENTS_CARD: "events_card",
  FLIGHTS_CARD: "flights_card",
  BUSINESS_CARD: "business_card",
  TRENDS_CARD: "trends_card",
  MARKET_CARD: "market_card",
  JOBS_CARD: "jobs_card",
};

/** When `result.schema` is set, the prep uses an adaptive card layout. */
export function cardLayoutFromResult(
  result: Record<string, unknown> | null | undefined,
): CardLayoutId | null {
  if (!result || typeof result.schema !== "string") return null;
  return SCHEMA_TO_LAYOUT[result.schema] ?? null;
}
