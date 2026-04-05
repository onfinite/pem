/**
 * Composite intelligent brief — `result.schema === "COMPOSITE_BRIEF"` (hub `prep_type` is **`composite`**).
 */

export type CompositeSectionType = string;

export type CompositeCardSchema =
  | "BUSINESS_CARD"
  | "PLACE_CARD"
  | "FLIGHTS_CARD"
  | "SHOPPING_CARD"
  | "EVENTS_CARD"
  | "JOBS_CARD"
  | "DRAFT_CARD";

export type CompositeSection = {
  type: CompositeSectionType;
  title: string;
  emoji: string;
  /** When set, render using the matching adaptive card component. */
  card_schema?: CompositeCardSchema | null;
  data: Record<string, unknown>;
  agent_note?: string;
  /** Verbatim tool/transcript lines for UI “evidence” under the section */
  evidence_snippets?: string[];
};

export type PemRecommendationData = {
  verdict: string;
  reasons: string[];
  caveat?: string;
  nextAction: string;
  methodology?: string;
};

export type CompositeBriefPayload = {
  schema: "COMPOSITE_BRIEF";
  is_composite: true;
  title: string;
  emoji: string;
  overview_teaser: string;
  sections: CompositeSection[];
  sources_used: string[];
  confidence: "high" | "medium" | "low";
  generated_at: string;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

export function parseCompositeBriefFromResult(
  result: Record<string, unknown> | null | undefined,
): CompositeBriefPayload | undefined {
  if (!result || typeof result !== "object") return undefined;
  if (result.schema !== "COMPOSITE_BRIEF") return undefined;

  const title = typeof result.title === "string" ? result.title : "";
  const emoji = typeof result.emoji === "string" ? result.emoji : "";
  const overview =
    typeof result.overview_teaser === "string" ? result.overview_teaser : "";
  const sectionsRaw = Array.isArray(result.sections) ? result.sections : [];
  const sections: CompositeSection[] = [];
  for (const s of sectionsRaw) {
    if (!isRecord(s)) continue;
    const type = typeof s.type === "string" ? s.type : "";
    const st = typeof s.title === "string" ? s.title : "";
    const em = typeof s.emoji === "string" ? s.emoji : "";
    const data = isRecord(s.data) ? s.data : {};
    const agent_note = typeof s.agent_note === "string" ? s.agent_note : undefined;
    const evidenceRaw = Array.isArray(s.evidence_snippets)
      ? s.evidence_snippets.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [];
    const evidence_snippets = evidenceRaw.length > 0 ? evidenceRaw.slice(0, 8) : undefined;
    if (!type || !st) continue;
    const card_schema =
      typeof s.card_schema === "string" && s.card_schema.length > 0
        ? (s.card_schema as CompositeCardSchema)
        : undefined;
    sections.push({ type, title: st, emoji: em, card_schema, data, agent_note, evidence_snippets });
  }
  if (sections.length < 2) return undefined;

  const sources_used = Array.isArray(result.sources_used)
    ? result.sources_used.filter((x): x is string => typeof x === "string")
    : [];
  const confidence =
    result.confidence === "high" || result.confidence === "medium" || result.confidence === "low"
      ? result.confidence
      : "medium";
  const generated_at =
    typeof result.generated_at === "string" ? result.generated_at : new Date().toISOString();

  return {
    schema: "COMPOSITE_BRIEF",
    is_composite: true,
    title: title || "Brief",
    emoji,
    overview_teaser: overview,
    sections,
    sources_used,
    confidence,
    generated_at,
  };
}

export function parsePemRecommendationData(data: Record<string, unknown>): PemRecommendationData | null {
  const verdict = typeof data.verdict === "string" ? data.verdict.trim() : "";
  if (!verdict) return null;
  const reasons = Array.isArray(data.reasons)
    ? data.reasons.filter((r): r is string => typeof r === "string" && r.trim().length > 0)
    : [];
  const caveat = typeof data.caveat === "string" ? data.caveat.trim() : undefined;
  const nextAction =
    typeof data.nextAction === "string"
      ? data.nextAction.trim()
      : typeof (data as { next_action?: string }).next_action === "string"
        ? (data as { next_action?: string }).next_action!.trim()
        : "";
  const methodology =
    typeof data.methodology === "string" ? data.methodology.trim() : undefined;
  return {
    verdict,
    reasons,
    caveat: caveat && caveat.length > 0 ? caveat : undefined,
    nextAction: nextAction || "Open the sections above and pick your next step.",
    methodology,
  };
}
