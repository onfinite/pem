import { z } from 'zod';

/**
 * Section row for composite briefs — `data` holds per-section payload (varies by `type`).
 * OpenAI structured `response_format` requires every schema node to have a **`type`** (see logs:
 * "`schema must have a 'type' key`"). **`z.any()`** becomes `{}` in JSON Schema (no `type`).
 * **`z.record(...)`** can emit **`propertyNames`**, which the API also rejects.
 * **`z.looseObject({})`** → `{ type: object, additionalProperties: {} }` — valid for the API.
 */
/**
 * OpenAI **strict** `response_format` requires every key in `properties` to appear in
 * `required` — Zod `.optional()` breaks that ("Missing 'agent_note'"). Use `null` for
 * absent optional fields instead.
 */
export const compositeSectionSchema = z.object({
  type: z.string(),
  title: z.string(),
  emoji: z.string(),
  /**
   * When set, the frontend renders this section using the matching adaptive card
   * component (e.g. "BUSINESS_CARD" → PrepBusinessExperience).
   * The \`data\` object must match what that card schema expects.
   * Null = render as generic text / markdown.
   */
  card_schema: z.union([z.string(), z.null()]),
  data: z.looseObject({}),
  agent_note: z.union([z.string(), z.null()]),
  /** Verbatim lines from tool output (URLs, prices, names) for UI “source” display */
  evidence_snippets: z.union([z.array(z.string()), z.null()]),
});

export const compositeBriefSchema = z.object({
  schema: z.literal('COMPOSITE_BRIEF'),
  is_composite: z.literal(true),
  title: z.string(),
  emoji: z.string(),
  overview_teaser: z.string(),
  /** At least one section; {@link normalizeCompositeBrief} adds PEM + OVERVIEW if needed. */
  sections: z.array(compositeSectionSchema).min(1),
  sources_used: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
  /** Use ISO-8601 or `null`; {@link normalizeCompositeBrief} fills when null. */
  generated_at: z.union([z.string(), z.null()]),
});

export type CompositeBriefResult = z.infer<typeof compositeBriefSchema>;

/** When true, user only needs one adaptive card / one tool vertical (rare). */
export const compositeDetectSchema = z.object({
  isSingleFocusedLane: z.boolean(),
  situationType: z.string(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type CompositeDetectResult = z.infer<typeof compositeDetectSchema>;

const PEM = 'PEM_RECOMMENDATION';

/** Keep `sources_used` honest — drop labels not grounded in the agent transcript. */
function filterSourcesUsedByTranscript(
  sources: string[],
  agentText: string,
): string[] {
  const t = agentText;
  const patterns: Record<string, RegExp> = {
    google_local_or_maps:
      /google_local|google_maps|google maps|vertical:\s*["']?local\b/i,
    google_local: /google_local|vertical:\s*["']?local\b/i,
    google_local_services:
      /google_local_services|local_services|vertical:\s*["']?local_services/i,
    google_flights: /google_flights|flight\|/i,
    google_hotels: /google_hotels|hotel\|/i,
    google_shopping: /google_shopping|vertical:\s*["']?shopping/i,
    tavily: /\btavily\b|search\(/i,
    serp: /serp|google\(/i,
    web: /google_organic|vertical:\s*["']?web/i,
    news: /google_news|vertical:\s*["']?news/i,
    maps_reviews: /maps_reviews|reviews\|/i,
  };

  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sources) {
    const k = s.toLowerCase().trim().replace(/-/g, '_');
    if (seen.has(k)) continue;
    const p = patterns[k];
    const ok = p ? p.test(t) : t.toLowerCase().includes(k);
    if (ok) {
      seen.add(k);
      out.push(s);
    }
  }
  return out.length > 0 ? out : ['tavily', 'serp'];
}

/** PEM must use verdict/reasons/nextAction — models often wrongly use summary only. */
function coercePemSectionData(
  data: Record<string, unknown>,
  raw: CompositeBriefResult,
  agentNote?: string | null,
): Record<string, unknown> {
  const teaser = raw.overview_teaser.trim() || raw.title.trim();
  const verdict = typeof data.verdict === 'string' ? data.verdict.trim() : '';
  const reasons = Array.isArray(data.reasons) ? data.reasons : null;
  const nextAction =
    typeof data.nextAction === 'string' ? data.nextAction.trim() : '';
  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';

  const reasonsAreOnlyStub =
    reasons?.length === 1 &&
    typeof reasons[0] === 'string' &&
    /synthesized from the research/i.test(reasons[0]);
  const reasonsDuplicateVerdict =
    reasons?.length === 1 &&
    typeof reasons[0] === 'string' &&
    verdict.length > 0 &&
    reasons[0].trim() === verdict.trim();
  /** Verdict repeats the overview line — not a real recommendation. */
  const verdictIsTeaserSpam =
    Boolean(teaser) && verdict.length > 0 && verdict === teaser;

  const structurallyComplete =
    verdict &&
    reasons &&
    reasons.length > 0 &&
    nextAction &&
    !verdictIsTeaserSpam &&
    !reasonsAreOnlyStub &&
    !reasonsDuplicateVerdict;

  if (structurallyComplete) {
    return data;
  }

  const note = agentNote?.trim() ?? '';
  const baseVerdict =
    verdict && !verdictIsTeaserSpam
      ? verdict
      : note
        ? note.slice(0, 500)
        : summary && summary !== teaser
          ? summary.slice(0, 500)
          : 'Review the options above, confirm price and fit, then complete the purchase yourself — Pem never checks out for you.';

  return {
    verdict: baseVerdict,
    reasons:
      reasons && reasons.length > 0 && !reasonsAreOnlyStub
        ? (reasons as string[])
        : note
          ? [note]
          : summary && summary !== teaser
            ? [summary.slice(0, 400)]
            : teaser
              ? [
                  `Context: ${teaser.slice(0, 220)}`,
                  'Use the sections above to compare options, then confirm prices and availability yourself.',
                ]
              : ['Synthesized from the research in this brief.'],
    caveat: typeof data.caveat === 'string' ? data.caveat : undefined,
    nextAction:
      nextAction ||
      'Confirm details with providers and take the final action yourself.',
    methodology:
      typeof data.methodology === 'string'
        ? data.methodology
        : 'Built from tools and sources in this prep run.',
  };
}

/** Normalize common model typos for section types. */
function normalizeSectionType(type: string): string {
  const t = (type ?? '').trim();
  if (!t) return 'UNKNOWN';
  const u = t.toUpperCase().replace(/\s+/g, '_');
  if (u === 'PEM_RECOMMENDATION' || u === 'PEM_REC' || u === 'RECOMMENDATION') {
    return PEM;
  }
  return t;
}

function stubPemSection(
  raw: CompositeBriefResult,
): z.infer<typeof compositeSectionSchema> {
  const teaser = raw.overview_teaser.trim() || raw.title.trim();
  return {
    type: PEM,
    title: 'Pem’s recommendation',
    emoji: '✅',
    card_schema: null,
    data: {
      verdict: teaser || 'Review the sections above.',
      reasons: ['Synthesized from the research in this brief.'],
      nextAction:
        'Confirm details and book or decide — you send the final action.',
      methodology: 'Built from tools and sources in this prep run.',
    },
    agent_note: null,
    evidence_snippets: null,
  };
}

function stubOverviewSection(
  raw: CompositeBriefResult,
): z.infer<typeof compositeSectionSchema> {
  return {
    type: 'OVERVIEW',
    title: 'Overview',
    emoji: '📋',
    card_schema: null,
    data: {
      summary:
        raw.overview_teaser.trim() || raw.title.trim() || 'Your prep brief.',
    },
    agent_note: null,
    evidence_snippets: null,
  };
}

export type NormalizeCompositeBriefOpts = {
  /** When set, filters `sources_used` so only tools implied by the transcript remain. */
  agentText?: string;
};

function normalizeEvidenceSnippets(raw?: string[] | null): string[] | null {
  if (!raw?.length) return null;
  const out = raw
    .map((x) => x.trim().slice(0, 400))
    .filter(Boolean)
    .slice(0, 8);
  return out.length > 0 ? out : null;
}

/**
 * Section types that should carry structured rows (places, offers, items, …)
 * rather than generic prose only. The LLM planner decides which types to create;
 * this set just validates that they shipped real data.
 *
 * Intentionally broad — any section about real-world entities (businesses, venues,
 * flights, products, services) should have structured arrays, not summaries.
 */
const SECTION_TYPES_NEEDING_STRUCTURE = new Set([
  'FLIGHTS',
  'HOTELS',
  'MAP_PLACES',
  'TOP_PICKS',
  'ITINERARY',
  'AIRBNB',
  'BEST_DATES',
  'PLACE_DETAILS',
  'HOTEL_OPTIONS',
  'HOTELS_STAY',
  'MOVING_SERVICES',
  'STORAGE_OPTIONS',
  'PLACES_TO_EXPLORE',
  'PLACES_EXPLORE',
  'LOCAL_SERVICES',
  'VENDORS',
  'VENUES',
  'PRODUCTS',
  'SHOPPING',
  'SERVICES',
  'COMPANIES',
  'JOBS',
  'EVENTS',
]);

function compositeSectionDataHasStructuredRows(
  data: Record<string, unknown>,
): boolean {
  for (const key of [
    'places',
    'businesses',
    'offers',
    'products',
    'events',
    'jobs',
    'routes',
    'options',
    'dateOptions',
    'items',
    'facts',
    'links',
  ]) {
    const v = data[key];
    if (Array.isArray(v) && v.length > 0) return true;
  }
  const bullets = data.bullets;
  return Array.isArray(bullets) && bullets.length >= 2;
}

function summaryHasConcreteSignals(summary: string): boolean {
  const s = summary.trim();
  if (s.length < 8) return false;
  if (/https?:\/\//i.test(s)) return true;
  if (/[$€£¥]\s*\d|\d+\s*(USD|EUR|GBP)|\b\d{1,3}[,.]\d{2}\b/.test(s)) {
    return true;
  }
  if (/\b\d{3,4}\b/.test(s)) return true;
  if (/\b\d{1,2}:\d{2}\b/.test(s)) return true;
  if (/\b[A-Z]{1,3}\d{3,4}\b/.test(s)) return true;
  /** Ratings like "4.9 rating", "4.5/5", "rated 4.8" */
  if (/\b\d\.\d\s*(\/5|stars?|rating)\b/i.test(s)) return true;
  if (/\brated?\s+\d\.\d/i.test(s)) return true;
  /** Addresses — street numbers + Ave / Blvd / St / Dr / Rd / Pkwy / Ln */
  if (/\b\d{2,5}\s+\w+\s+(Ave|Blvd|St|Dr|Rd|Pkwy|Ln|Way|Ct|Pl)\b/i.test(s)) {
    return true;
  }
  /** Numbered list with bold names (markdown) — strong sign of real content */
  if (/\d+\.\s+\*\*[^*]{3,}\*\*/m.test(s)) return true;
  /** Named businesses — at least two capitalized multi-word names */
  const namedEntities = s.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+/g);
  if (namedEntities && namedEntities.length >= 2) return true;
  return false;
}

function transcriptLooksToolRich(agentText: string): boolean {
  const t = agentText;
  return (
    /\bhttps?:\/\//i.test(t) ||
    /\bgoogle_(hotels|maps|local|flights|shopping)\b/i.test(t) ||
    /\bhotel\|/i.test(t) ||
    /\bflight\|/i.test(t) ||
    /\bvertical:\s*["']?(hotels|maps|local)\b/i.test(t)
  );
}

function briefHasStructuredRowsAnywhere(brief: CompositeBriefResult): boolean {
  for (const s of brief.sections) {
    if (s.type === 'PEM_RECOMMENDATION') continue;
    const d =
      s.data && typeof s.data === 'object' && !Array.isArray(s.data)
        ? (s.data as Record<string, unknown>)
        : {};
    if (compositeSectionDataHasStructuredRows(d)) return true;
  }
  return false;
}

/**
 * True when the formatter produced only fluff for travel sections despite a long agent run —
 * caller should skip persisting COMPOSITE_BRIEF and fall back to adaptive / structured output.
 *
 * Uses a **proportional check**: if the majority of structure-needing sections pass
 * (have structured rows, concrete signals in summary, or were coerced to places),
 * the brief is accepted. We only reject when more than half are empty/vague.
 *
 * Pass a `Logger` to get per-section diagnostic output.
 */
export function compositeBriefIsTooThin(
  brief: CompositeBriefResult,
  agentText: string,
  log?: { debug: (msg: string) => void },
): boolean {
  const t = agentText.trim();
  if (t.length < 600) return false;

  let structSectionsChecked = 0;
  let structSectionsPassed = 0;
  let hasGapPlaceholder = false;

  for (const s of brief.sections) {
    if (s.type === PEM || s.type === 'OVERVIEW') continue;
    if (!SECTION_TYPES_NEEDING_STRUCTURE.has(s.type)) {
      log?.debug(
        `thinCheck: skip "${s.type}" — not in SECTION_TYPES_NEEDING_STRUCTURE`,
      );
      continue;
    }
    structSectionsChecked++;
    const d =
      s.data && typeof s.data === 'object' && !Array.isArray(s.data)
        ? (s.data as Record<string, unknown>)
        : {};
    if (compositeSectionDataHasStructuredRows(d)) {
      structSectionsPassed++;
      log?.debug(`thinCheck: PASS "${s.type}" — has structured rows`);
      continue;
    }
    const summary = typeof d.summary === 'string' ? d.summary : '';
    if (summary.includes('were not pulled into this brief')) {
      hasGapPlaceholder = true;
      log?.debug(`thinCheck: GAP  "${s.type}" — gap placeholder text`);
      continue;
    }
    if (summaryHasConcreteSignals(summary)) {
      structSectionsPassed++;
      log?.debug(
        `thinCheck: PASS "${s.type}" — summary has concrete signals (${summary.slice(0, 80)}…)`,
      );
      continue;
    }
    log?.debug(
      `thinCheck: FAIL "${s.type}" — no rows, no concrete signals (summary=${summary.slice(0, 80)})`,
    );
  }

  log?.debug(
    `thinCheck: structChecked=${structSectionsChecked} passed=${structSectionsPassed} gaps=${hasGapPlaceholder ? 'yes' : 'no'}`,
  );

  if (structSectionsChecked > 0) {
    if (structSectionsPassed === 0 && hasGapPlaceholder) return true;
    if (structSectionsPassed < structSectionsChecked / 2) return true;
  }

  if (t.length > 900 && transcriptLooksToolRich(t)) {
    if (!briefHasStructuredRowsAnywhere(brief)) {
      log?.debug(
        'thinCheck: REJECT — tool-rich transcript but no structured rows anywhere',
      );
      return true;
    }
  }

  return false;
}

/**
 * Ensures PEM_RECOMMENDATION exists and is last, and at least two sections.
 * Never throws — the formatter mini-model often omits PEM or mis-labels types.
 */
export function normalizeCompositeBrief(
  raw: CompositeBriefResult,
  opts?: NormalizeCompositeBriefOpts,
): CompositeBriefResult {
  const sections = raw.sections.map((s) => ({
    ...s,
    type: normalizeSectionType(s.type),
    evidence_snippets: normalizeEvidenceSnippets(s.evidence_snippets) ?? null,
  }));

  const pemBlocks = sections.filter((s) => s.type === PEM);
  const nonPem = sections.filter((s) => s.type !== PEM);

  const pem =
    pemBlocks.length > 0
      ? pemBlocks[pemBlocks.length - 1]
      : stubPemSection(raw);

  let ordered = [...nonPem, pem];

  if (ordered.length < 2) {
    ordered = [stubOverviewSection(raw), pem];
  }

  const filled = fillEmptyCompositeSectionData(ordered, raw);
  const coerced = coerceSummaryToPlaces(filled);
  const withData = sanitizeTemplateSpamSectionData(coerced, raw);

  /** Server time — never trust the mini-model’s clock (avoids fake years). */
  const generated_at = new Date().toISOString();
  let sources_used =
    raw.sources_used && raw.sources_used.length > 0
      ? raw.sources_used
      : ['tavily', 'serp'];
  if (opts?.agentText?.trim()) {
    sources_used = filterSourcesUsedByTranscript(sources_used, opts.agentText);
  }

  return {
    ...raw,
    sections: withData,
    generated_at,
    sources_used,
  };
}

/**
 * When the model produces a rich markdown summary (numbered list with bold names, ratings,
 * addresses) instead of structured `places` — parse it into a `places` array.
 * Only applied to sections in SECTION_TYPES_NEEDING_STRUCTURE that lack structured rows.
 */
function coerceSummaryToPlaces(
  sections: z.infer<typeof compositeSectionSchema>[],
): z.infer<typeof compositeSectionSchema>[] {
  return sections.map((s) => {
    if (s.type === PEM || s.type === 'OVERVIEW') return s;
    if (!SECTION_TYPES_NEEDING_STRUCTURE.has(s.type)) return s;
    const d =
      s.data && typeof s.data === 'object' && !Array.isArray(s.data)
        ? (s.data as Record<string, unknown>)
        : {};
    if (compositeSectionDataHasStructuredRows(d)) return s;
    const summary = typeof d.summary === 'string' ? d.summary : '';
    const content = typeof d.content === 'string' ? d.content : '';
    const text = summary || content;
    if (!text || text.length < 30) return s;

    const places = parsePlacesFromMarkdown(text);
    if (places.length < 2) return s;

    return { ...s, data: { ...d, places } };
  });
}

/**
 * Extracts structured place objects from markdown numbered lists.
 * Handles patterns like:
 *   1. **Business Name** - description, rated 4.9
 *   2. **Another Place** — 123 Main St, $50/night
 */
function parsePlacesFromMarkdown(text: string): {
  name: string;
  address?: string;
  price?: string;
  rating?: string;
  why?: string;
}[] {
  const lines = text.split('\n');
  const places: {
    name: string;
    address?: string;
    price?: string;
    rating?: string;
    why?: string;
  }[] = [];

  for (const line of lines) {
    const match = line.match(/^\s*\d+\.\s+\*\*([^*]+)\*\*\s*[-—:]\s*(.*)/);
    if (!match) continue;
    const name = match[1].trim();
    const rest = match[2].trim();
    if (!name || name.length < 2) continue;

    const place: (typeof places)[number] = { name };

    const priceMatch = rest.match(
      /\$[\d,.]+(?:\s*[/-]\s*\$?[\d,.]+)?(?:\s*\/?\s*(?:night|month|mo|hr))?/i,
    );
    if (priceMatch) place.price = priceMatch[0];

    const ratingMatch = rest.match(/(\d\.\d)\s*(?:\/5|stars?|rating)/i);
    if (ratingMatch) place.rating = `${ratingMatch[1]}/5`;

    const addrMatch = rest.match(
      /\d{2,5}\s+\w+\s+(?:Ave|Blvd|St|Dr|Rd|Pkwy|Ln|Way|Ct|Pl)\b[^,.]*/i,
    );
    if (addrMatch) place.address = addrMatch[0].trim();

    const cleanedWhy = rest
      .replace(priceMatch?.[0] ?? '', '')
      .replace(ratingMatch?.[0] ?? '', '')
      .replace(addrMatch?.[0] ?? '', '')
      .replace(/[,.\s]+$/, '')
      .replace(/^[,.\s-—]+/, '')
      .trim();
    if (cleanedWhy.length > 5) place.why = cleanedWhy;

    places.push(place);
  }

  return places;
}

/** OpenAI allows empty `data: {}` — replace with a minimal summary so the brief is never hollow. */
function fillEmptyCompositeSectionData(
  sections: z.infer<typeof compositeSectionSchema>[],
  raw: CompositeBriefResult,
): z.infer<typeof compositeSectionSchema>[] {
  const teaser = raw.overview_teaser.trim() || raw.title.trim();
  return sections.map((s) => {
    const d =
      s.data && typeof s.data === 'object' && !Array.isArray(s.data)
        ? (s.data as Record<string, unknown>)
        : {};
    if (s.type === PEM) {
      return {
        ...s,
        data: coercePemSectionData(d, raw, s.agent_note),
      };
    }
    if (Object.keys(d).length > 0) return s;
    return {
      ...s,
      data: {
        summary: teaser
          ? `${s.title} — ${teaser}`
          : `Details for ${s.title} were thin in this run — ask Pem to dig deeper in a follow-up.`,
      },
    };
  });
}

/** True when the formatter repeated the overview teaser or our empty-section stub pattern. */
function isTeaserSpamSummary(
  title: string,
  summary: string,
  teaser: string,
): boolean {
  const t = title.trim();
  const s = summary.trim();
  const te = teaser.trim();
  if (!te || !s) return false;
  if (s === te) return true;
  if (s === `${t} — ${te}`) return true;
  return false;
}

/**
 * Replaces duplicate “{title} — {overview_teaser}” blobs with `agent_note` or an honest gap line.
 * Runs after empty-fill so we do not leave every section looking identical.
 */
function sanitizeTemplateSpamSectionData(
  sections: z.infer<typeof compositeSectionSchema>[],
  raw: CompositeBriefResult,
): z.infer<typeof compositeSectionSchema>[] {
  const teaser = raw.overview_teaser.trim() || raw.title.trim();
  const nonPemSummaries: string[] = [];
  for (const s of sections) {
    if (s.type === PEM) continue;
    const d = s.data as Record<string, unknown>;
    const sum = typeof d.summary === 'string' ? d.summary.trim() : '';
    if (sum) nonPemSummaries.push(sum);
  }
  const dupCount = (txt: string) =>
    nonPemSummaries.filter((x) => x === txt).length;

  return sections.map((s) => {
    if (s.type === PEM) {
      const d =
        s.data && typeof s.data === 'object' && !Array.isArray(s.data)
          ? (s.data as Record<string, unknown>)
          : {};
      return { ...s, data: coercePemSectionData(d, raw, s.agent_note) };
    }

    const d =
      s.data && typeof s.data === 'object' && !Array.isArray(s.data)
        ? (s.data as Record<string, unknown>)
        : {};
    const summary = typeof d.summary === 'string' ? d.summary.trim() : '';
    const note = typeof s.agent_note === 'string' ? s.agent_note.trim() : '';

    const spammy =
      isTeaserSpamSummary(s.title, summary, teaser) ||
      (summary.length > 0 && dupCount(summary) >= 2);

    if (!spammy) {
      return s;
    }

    if (s.type === 'OVERVIEW') {
      return {
        ...s,
        data: { summary: teaser || summary || 'Overview of your situation.' },
      };
    }

    if (note) {
      const upper = s.type.toUpperCase();
      if (upper === 'CHECKLIST') {
        const bullets = note
          .split(/[;\n]/)
          .map((x) => x.trim())
          .filter(Boolean);
        return {
          ...s,
          data:
            bullets.length > 1 ? { bullets, summary: note } : { summary: note },
        };
      }
      return { ...s, data: { summary: note } };
    }

    const snippets = Array.isArray(s.evidence_snippets)
      ? s.evidence_snippets.filter(
          (x) => typeof x === 'string' && x.trim().length > 0,
        )
      : [];
    if (snippets.length >= 2) {
      return {
        ...s,
        data: { summary: snippets.join(' \u00B7 ') },
      };
    }

    return {
      ...s,
      data: {
        summary: `Specific details for “${s.title}” were not pulled into this brief — open the prep detail to see the full agent run and steps.`,
      },
    };
  });
}
