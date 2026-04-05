/**
 * Heuristics layered on top of gpt-4o-mini composite detection.
 * Product default: **composite brief** for situational / partial / multi-domain asks;
 * **single-lane** only for explicit, atomic outputs (pipe flight matrix, tight fare lookup, etc.).
 */

/** Trip / travel language without a full spec — composite. */
const VAGUE_TRAVEL =
  /\b(prep for|help me (with )?prep|planning (a |my )?(trip|vacation|flight)|plan (a |my |the )?(trip|vacation|getaway|itinerary|weekend)|trip to|trip planner|travel to|travel plans?|vacation in|getaway|weekend in|going to|visiting|things to do|itinerary|where to stay|hotel|airbnb|rent a car|book a (flight|hotel|trip)|flights? and hotels?)\b/i;

/** Named destinations + common metros (LA was missing before). */
const TRIP_DESTINATION =
  /\b(las vegas|vegas|reno|nevada|hawaii|miami|orlando|denver|phoenix|weekend|los angeles|\bla\b|san francisco|\bsf\b|nyc|new york|chicago|seattle|austin|boston|portland|san diego|washington dc|atlanta|dallas|houston|nashville|europe|paris|london|tokyo)\b/i;

/**
 * Broad “messy life” asks — usually multi-section, not one card.
 * Kept separate from travel so we can tune independently.
 */
const VAGUE_SITUATIONAL =
  /\b(help me (figure|figure out|decide|plan)|not sure (how|what|where)|what should i|where do i start|big (decision|change)|moving to|wedding planning|starting a business|switching jobs|career change|brain dump)\b/i;

/**
 * Prefer a multi-section brief when wording is situational, not a tight search query.
 */
export function shouldPreferCompositeBrief(thought: string): boolean {
  const t = thought.trim();
  if (t.length < 3) return false;
  if (VAGUE_TRAVEL.test(t)) return true;
  if (VAGUE_SITUATIONAL.test(t)) return true;
  if (
    TRIP_DESTINATION.test(t) &&
    /\b(flight|fly|fly to|trip|visit|hotel|itinerary|vacation|weekend|stay|plan)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Only treat as single-lane (skip composite) when the user gave a **tight, explicit**
 * one-off: Serp flight pipe, or IATA–IATA + date + flight-only vocabulary.
 * Everything covered by {@link shouldPreferCompositeBrief} stays multi-lane.
 */
export function isNarrowAtomicSingleLaneAsk(thought: string): boolean {
  const t = thought;

  if (shouldPreferCompositeBrief(thought)) return false;

  // Pipe format from our Serp contract — clearly a flight matrix lookup only
  if (/\bflight\|[A-Z]{3}\|[A-Z]{3}\|\d{4}-\d{2}-\d{2}\b/i.test(t)) return true;

  // Short message with IATA-IATA + ISO date and flight-only vocabulary
  if (t.length < 600) {
    const lower = t.toLowerCase();
    const hasAirports = /\b[A-Z]{3}\s*(→|➜|->|to)\s*[A-Z]{3}\b/i.test(t);
    const hasDate =
      /\d{4}-\d{2}-\d{2}|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/i.test(
        lower,
      );
    const flightOnly =
      /\b(flight|flights|fare|non-?stop|direct|one-?way|round-?trip)\b/i.test(
        lower,
      ) &&
      !/\b(hotel|stay|rent|itinerary|attractions|what to do)\b/i.test(lower);
    if (hasAirports && hasDate && flightOnly) return true;
  }

  /**
   * Tight retail / product buy — one shopping prep (options card), not a multi-section
   * composite brief. Use **thought only** so a long dump transcript does not disable this.
   */
  const thoughtOnly = thought.trim();
  if (thoughtOnly.length > 0 && thoughtOnly.length < 600) {
    const bundle = thoughtOnly.toLowerCase();
    const wantsProduct =
      /\b(buy|order|purchase|get me|find me|looking to buy|need (a |some )?)\b/i.test(
        thoughtOnly,
      ) &&
      /\b(shoes|sneakers|boots|sandals|cleats|nike|adidas|new balance|asics|shirt|jacket|dress|hoodie|laptop|phone|headphones|earbuds|watch|size\s*[\d.]+|men'?s|women'?s|kids'?)\b/i.test(
        thoughtOnly,
      );
    const situational =
      /\b(plan (a )?(trip|move|wedding)|moving to|career change|brain dump|starting a business|outfit(s)? for the whole|wardrobe overhaul)\b/i.test(
        bundle,
      );
    const comparisonEssay =
      /\b(compare|versus|vs\.|multiple brands|outfit ideas for every)\b/i.test(
        bundle,
      );
    if (wantsProduct && !situational && !comparisonEssay) {
      return true;
    }
  }

  return false;
}
