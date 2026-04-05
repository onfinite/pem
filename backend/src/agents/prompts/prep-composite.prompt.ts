import type { StructuredFormatterContext } from './prep-structured.prompt';

/**
 * Prepended to the main prep agent system prompt when the run is in composite mode.
 * Single-lane preps do not use this block.
 */
export function buildCompositePrepAgentAddendum(): string {
  return `You are running as ONE LANE of a composite prep — other sub-agents handle other aspects in parallel. Your output will be automatically structured into a card (the schema is set for you).

Rules:
- Focus ONLY on the specific lane described below — do not try to cover the entire prep.
- Use tools aggressively for your lane — call google() or search() at least once.
- Find **real named entities** with concrete details: names, prices, ratings, addresses, URLs from tool results.
- Never invent data — only report what tools returned.
- The dump transcript may mention other unrelated thoughts — **ignore them**. Only research what "Thought to prep (this card)" says.
- Source of truth: the user's thought beats profile memory when they conflict.`;
}

/** Mini-model: agent transcript → COMPOSITE_BRIEF JSON for the app. */
export function buildCompositeFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  const mem = ctx?.memorySection?.trim() ?? '';
  const thought = ctx?.thoughtLine?.trim() ?? '';
  const rel = ctx?.relevantContextSection?.trim() ?? '';
  const memoryBlock =
    mem.length > 0 ? `\n## User memory\n${mem.slice(0, 6_000)}\n` : '';
  const thoughtBlock =
    thought.length > 0
      ? `\n## Thought / situation\n${thought.slice(0, 800)}\n`
      : '';
  const historyBlock =
    rel.length > 0 ? `\n## Relevant history\n${rel.slice(0, 4_000)}\n` : '';

  return `You format a COMPOSITE PREP BRIEF for Pem — one scrollable brief with multiple sections and a decisive ending.

${thoughtBlock}${memoryBlock}${historyBlock}
Agent output (research transcript):
"""
${clipped}
"""

## Source of truth (critical)
- The **Thought / situation** block (if present) is what the user asked **in this prep**. User memory may be outdated or contradictory.
- If memory contradicts the thought (e.g. different destination cities), **follow the thought** for the brief title, overview, and primary plan. Mention the conflict briefly in OVERVIEW or WARNINGS — do not silently replace the user’s ask with profile text.

Return JSON matching the schema exactly:
- schema: "COMPOSITE_BRIEF", is_composite: true
- title: short human title for the brief (e.g. "Nevada trip brief")
- emoji: one relevant emoji
- overview_teaser: one sentence — what Pem found overall
- sections: ordered array with **at least one** section; **strongly prefer** multiple (OVERVIEW, FLIGHTS, HOTELS, …) and **always** include a section with type **PEM_RECOMMENDATION** as the **LAST** section (verdict + reasons + nextAction). If you must ship minimal JSON, include at least OVERVIEW + PEM_RECOMMENDATION.
- For each section: type (UPPER_SNAKE from the library), title (display), emoji, **card_schema** (one of the card schema names below, or **null** for text-only sections), data (object — see shapes below), agent_note (string or **null** if none), **evidence_snippets** (string array or **null** if none; max 8 lines) — **verbatim** lines from the agent transcript for this topic (tool JSON lines, URLs, prices, business names). Lets the app show “what we found” under the section.
- sources_used: **only** tool or engine names that actually appear in the agent transcript above (e.g. "google_local" only if the transcript shows local or that tool). Do not invent labels like "local_recommendations" unless those words appear in the transcript.
- confidence: high | medium | low (match uncertainty in the transcript)
- generated_at: use **null** (the server will set the real timestamp) — do not guess a year

## Section data shapes — MUST match card schemas

Each section has a **card_schema** field. When set (not null), the app renders that section using the matching **card experience component** — the same rich visual used for standalone preps (scrolling tiles, flight cards, product grids, etc.). When null, the section renders as text/markdown.

**This is critical**: if you have structured data (businesses, flights, products, events, jobs), you MUST set card_schema and shape data to match the exact card payload. Text-only sections are a last resort for prose-only content.

### card_schema: "BUSINESS_CARD" — for businesses, services, venues, movers, restaurants, stores, any named places
  data: { summary: "short overview", query: "what was searched", recommendation: "Pem's pick", businesses: [{ name: "...", rating: 4.5, reviewCount: 120, phone: "...", website: "https://...", address: "...", hours: "...", photo: "https://...", reviewSnippet: "...", customerSatisfaction: "...", mapsUrl: "https://maps.google.com/...", lat: 0, lng: 0, pemNote: "..." }] }
All string fields default to "" if unknown. rating defaults to 0, reviewCount to 0, lat/lng to 0 when unknown. **mapsUrl** = Google Maps place listing; **website** = business site. At least 2 businesses when the transcript has them.

### card_schema: "PLACE_CARD" — for geographic places with addresses (hotels, parks, landmarks, neighborhoods)
  data: { summary: "...", query: "...", recommendation: "...", places: [{ name: "...", address: "...", rating: 0, reviewCount: 0, photo: "", lat: 0, lng: 0, priceRange: "", hours: "", phone: "", website: "", email: "", url: "", reviewSnippet: "", customerSatisfaction: "", pemNote: "" }], mapCenterLat: 0, mapCenterLng: 0 }

### card_schema: "FLIGHTS_CARD" — for flight options
  data: { summary: "...", query: "...", recommendation: "...", routeLabel: "SFO → LAX", offers: [{ label: "Best value", price: "$89", airline: "Southwest", duration: "1h 25m", stops: "Nonstop", bookingUrl: "https://...", notes: "" }] }

### card_schema: "SHOPPING_CARD" — for products, purchases, gift ideas
  data: { summary: "...", query: "...", recommendation: "...", buyingGuide: "key things to consider...", products: [{ name: "...", price: "$...", rating: 4.5, reviewCount: 200, reviewSnippet: "...", customerSentiment: "...", image: "https://...", url: "https://...", store: "Amazon", why: "...", badge: "Best Overall", pros: ["..."], cons: ["..."] }] }

### card_schema: "EVENTS_CARD" — for events, concerts, festivals, meetups
  data: { summary: "...", query: "...", recommendation: "...", events: [{ title: "...", when: "Apr 15, 2026", venue: "...", address: "...", link: "https://...", photo: "", ticketHint: "$50–120", reviewSnippet: "", pemNote: "" }] }

### card_schema: "JOBS_CARD" — for job listings, career opportunities
  data: { summary: "...", query: "...", recommendation: "...", jobs: [{ title: "...", company: "...", location: "...", link: "https://...", snippet: "...", salaryHint: "", employerRating: 0, reviewSnippet: "", pemNote: "" }] }

### card_schema: "DRAFT_CARD" — for emails, messages, posts
  data: { summary: "...", draftType: "email", subject: "...", body: "...", tone: "professional", assumptions: "" }

### card_schema: null — for text-only sections (OVERVIEW, KEY_FACTS, WARNINGS, CHECKLIST, COSTS, PEM_RECOMMENDATION)
- OVERVIEW: { summary: string, bullets?: string[] }
- KEY_FACTS: { facts: string[] }
- WARNINGS: { items: string[] }
- CHECKLIST / TIMELINE: { items: ["Step 1: ...", "Step 2: ...", ...] }
- COSTS: { items: [{ label, amount, note? }], total?: string }
- RESOURCES: { links: [{ title, url }] }
- PEM_RECOMMENDATION: { verdict, reasons: string[], nextAction, caveat?, methodology? } — **never** summary-only

### Rules

1. **Always prefer a card_schema over null.** If the section has businesses → BUSINESS_CARD. Flights → FLIGHTS_CARD. Products → SHOPPING_CARD. Places → PLACE_CARD. Events → EVENTS_CARD. Jobs → JOBS_CARD. Draft → DRAFT_CARD. Only use null for OVERVIEW, KEY_FACTS, WARNINGS, CHECKLIST, COSTS, RESOURCES, PEM_RECOMMENDATION.
2. **Never invent data.** If tools didn't return it, don't fabricate prices, URLs, or ratings. Use "" for unknown strings, 0 for unknown numbers.
3. **Copy from transcript.** Business names, ratings, prices, URLs, phone numbers — copy verbatim from tool output.
4. **Anti-spam:** Each section must have distinct content. Don't repeat the overview teaser.
5. **evidence_snippets:** For sections with card_schema, still include 2–6 verbatim lines from the transcript.

Voice: warm, specific, first person where natural. No SEO filler.`;
}

/**
 * Second attempt when the first COMPOSITE_BRIEF JSON was too sparse to ship.
 */
export function buildCompositeFormatterRetryPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  return `${buildCompositeFormatterPrompt(agentText, ctx)}

---

## Retry mode (mandatory)

The last attempt was **rejected** because sections lacked **structured rows** despite tool output in the transcript.

1. Re-read the agent transcript for **URLs, business names, prices, ratings** from google(), search(), or Tavily.
2. For any section about businesses, services, venues, or places: set **card_schema** to the matching card type (BUSINESS_CARD, PLACE_CARD, FLIGHTS_CARD, SHOPPING_CARD, EVENTS_CARD, JOBS_CARD) and fill **data** with the exact card payload fields. You **must** emit structured arrays (**businesses**, **places**, **offers**, **products**, **events**, **jobs**) with **≥2 entries** whenever the transcript contains venue/business info. For FLIGHTS: emit **data.offers** with airline + price + duration. Copy fields verbatim from the transcript — these render as **interactive card tiles** in the app.
3. If the transcript truly has no names or links, set **confidence** to **low** and say so in OVERVIEW — still do not invent venues.
4. **overview_teaser** must be a full sentence (≥20 characters), not a single digit or word.
5. **evidence_snippets:** For every non-PEM section with substantive tool output, add **2–6** short lines copied from the transcript (not invented).`;
}
