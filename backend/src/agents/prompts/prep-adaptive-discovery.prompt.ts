import type { StructuredFormatterContext } from './prep-structured.prompt';

function ctxBlocks(ctx?: StructuredFormatterContext): string {
  const mem = ctx?.memorySection?.trim() ?? '';
  const thought = ctx?.thoughtLine?.trim() ?? '';
  const rel = ctx?.relevantContextSection?.trim() ?? '';
  const memoryBlock =
    mem.length > 0 ? `\n## User memory\n${mem.slice(0, 6_000)}\n` : '';
  const thoughtBlock =
    thought.length > 0 ? `\n## Thought\n${thought.slice(0, 800)}\n` : '';
  const historyBlock =
    rel.length > 0 ? `\n## Relevant history\n${rel.slice(0, 4_000)}\n` : '';
  return `${thoughtBlock}${memoryBlock}${historyBlock}`;
}

/** EVENTS intent — concerts, festivals, things to do. */
export function buildEventsCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  return `Format an EVENTS prep for Pem — real events only from the agent trace (google_events, etc.).

${ctxBlocks(ctx)}
## Agent output
"""
${clipped}
"""

Return JSON matching the schema. **events** rows: title, when, venue, address, link, photo ("" if none), ticketHint (""), reviewSnippet (short note from reviews/sentiment if present in trace; else ""), pemNote (why it fits). Never invent URLs or dates.

Forbidden: "Explore", "Discover", "I'd be happy to help".`;
}

export function buildFlightsCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  return `Format a FLIGHTS prep — offers must come from agent google_flights / tool data only.

${ctxBlocks(ctx)}
## Agent output
"""
${clipped}
"""

**routeLabel** — bold human line: origin city or IATA → destination · dates · one-way or round-trip (e.g. "AUS → LAS · Jun 12–15 · round trip").
**offers** (up to 5): 
- **label**: short badge — "Best overall", "Cheapest", "Shortest", "Direct", "Fewest stops" (pick what fits).
- **price** — exact from trace (e.g. "$187").
- **airline** — carrier name(s).
- **duration** — e.g. "3h 45m" or "6h 20m with layover".
- **stops** — "Nonstop" or "1 stop (DEN)" or "2 stops".
- **bookingUrl** — real link from trace or "".
- **notes** — optional: departure/arrival local times if present in trace (e.g. "7:05a → 8:50a local"); else "".

Never invent prices, times, or URLs.

Forbidden: "Explore", "Discover", "I'd be happy to help".`;
}

export function buildBusinessCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  return `Format a BUSINESS prep — SMB / service providers with reputation signals from maps, local, reviews, or search.

${ctxBlocks(ctx)}
## Agent output
"""
${clipped}
"""

**businesses**: name, rating 0–5, reviewCount, phone, website, address, hours, photo, **reviewSnippet** (short; "" if none), **customerSatisfaction** (one line on what customers say; "" if none), mapsUrl (Google Maps link when present), pemNote. Real data only.

Forbidden: "Explore", "Discover", "I'd be happy to help".`;
}

export function buildTrendsCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  return `Format a TRENDS prep — keyword interest from google_trends + context.

${ctxBlocks(ctx)}
## Agent output
"""
${clipped}
"""

**keyword**, **trendReadout** (plain explanation of what the trend shows), **relatedQueries** (up to 12 strings), **timeframe** (e.g. "Past 12 months" or from trace), **sources** with real URLs. Never invent trend numbers — describe qualitatively if data is thin.

Forbidden: "Explore", "Discover", "I'd be happy to help".`;
}

export function buildMarketCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  return `Format a MARKET prep — stocks / FX / instruments from google_finance + context.

${ctxBlocks(ctx)}
## Agent output
"""
${clipped}
"""

**symbol**, **name**, **price**, **change**, **currency**, **sentiment** (one line: analyst or market tone from trace; "" if none), **keyPoints** (bullets), **sources**. Numbers must match the agent trace — never invent quotes.

Forbidden: "Explore", "Discover", "I'd be happy to help".`;
}

export function buildJobsCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  return `Format a JOBS prep — listings from google_jobs + context.

${ctxBlocks(ctx)}
## Agent output
"""
${clipped}
"""

**jobs**: title, company, location, link, snippet, salaryHint ("" if unknown), **employerRating** 0–5 (from Glassdoor-like data in trace only; else 0), **reviewSnippet** (employer reputation one-liner; ""), pemNote. Real URLs only.

Forbidden: "Explore", "Discover", "I'd be happy to help".`;
}
