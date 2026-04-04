import type { StructuredFormatterContext } from './prep-structured.prompt';

/** Synthesize agent trace into SHOPPING_CARD JSON (after tools ran). */
export function buildShoppingCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  const mem = ctx?.memorySection?.trim() ?? '';
  const thought = ctx?.thoughtLine?.trim() ?? '';
  const rel = ctx?.relevantContextSection?.trim() ?? '';
  const memoryBlock =
    mem.length > 0
      ? `\n## User memory (constraints — never invent beyond this + agent output)\n${mem.slice(0, 6_000)}\n`
      : '';
  const thoughtBlock =
    thought.length > 0
      ? `\n## What they want to buy / compare\n${thought.slice(0, 800)}\n`
      : '';
  const historyBlock =
    rel.length > 0
      ? `\n## Relevant history (past preps / older dumps)\n${rel.slice(0, 4_000)}\n`
      : '';

  return `You format a SHOPPING prep for Pem — a mobile app. The agent already searched and (maybe) fetched pages. Your job: turn that into a tight **shopping card** JSON — not chat prose.

${thoughtBlock}${memoryBlock}${historyBlock}
## Agent output (raw)
"""
${clipped}
"""

Return JSON matching the schema exactly.

## summary
One warm line for the hub card (first person or direct "you" — like Pem texting after running an errand). Specific beats generic; reflect budget/city from memory when present.

## query
Short restatement of what we shopped for (for UI subtitle).

## recommendation
One punchy line: "Best overall: …" or "Pem's pick: …" — must follow from agent data.

## buyingGuide
1–2 sentences of honest buying advice, or "" if nothing additive.

## products (1–10 rows) — e-commerce style
- **Rows 1–3 (hero):** Best picks — full detail: \`why\`, \`pros\`/\`cons\` when helpful, \`badge\` when justified.
- **Rows 4–10 (optional):** Up to **7** more **distinct** products from the trace — “browse more” tiles: shorter \`why\` or "", empty \`pros\`/\`cons\` OK; **name**, **price**, **url**, **store**, **image**, **rating** must still come from agent data only. **Never** duplicate URLs or pad with fake rows.
- Real products only — names, prices, URLs, images from the agent output **only**. If the agent lacked an image URL, use "" for image.
- **Minimum (hero):** If \`google_shopping\` **or** \`amazon_search\` has **2+** viable rows, output **at least 2** products in positions 1–3. If the trace has only **one** usable row, output a single product total.
- **Target:** When many viable rows exist, aim for **3 hero + more** (up to **10** total) so the app shows a main carousel and a compact grid below.
- **Never** use **news, TV, or magazine sites** as **url** (e.g. today.com, nbcnews.com, cnn.com, forbes.com, wired.com) — those are articles, not checkout pages. If the only link in the trace is editorial, take product rows from \`google_shopping\` / \`amazon_search\` instead.
- **Pick offers** — **prefer major retailers** in this order: Amazon, Walmart, Target, Best Buy, Costco, Home Depot, Lowe's, Wayfair, then other well-known stores. Use \`amazon_search\` for Amazon-native links and \`google_shopping\` for mixed merchants; **do not** collapse everything into one affiliate blog pick.
- **url** must be a **direct retailer product page** where someone can add-to-cart or buy (e.g. amazon.com/dp/…, target.com/p/…, walmart.com/ip/…, bestbuy.com/site/…, brand.com product URL).
- **Never** put in **url**: Google Shopping (shopping.google.com), Google Maps, Yelp, TripAdvisor, Yellow Pages, Facebook Marketplace browse, or generic Google/Bing **search** result URLs — use "" if the agent only had those; do not guess a retailer URL.
- **image** — from the same product row as the chosen **url**. Prefer **\`serpapi_thumbnail\`** from \`google_shopping\` JSON when present (mobile-friendly); otherwise **\`thumbnail\`**. Also allow retailer CDN / https URLs from **fetch** or the agent trace. If the only image URLs are **LinkedIn** (licdn.com / media.licdn.com) or other hotlink-blocked hosts, use **""** — the app cannot display them.
- rating: 0–5 number; use 0 if unknown.
- pros / cons: short bullets (arrays can be empty).
- badge: "" or one of Best Value | Top Rated | Pem's Pick when justified.
- Never invent prices, stores, or links.

Forbidden in any string: "Explore", "Discover", "Ultimate guide", "I'd be happy to help".`;
}

/** Synthesize agent trace into DRAFT_CARD JSON. */
export function buildDraftCardFormatterPrompt(
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
    thought.length > 0 ? `\n## Writing task\n${thought.slice(0, 800)}\n` : '';
  const historyBlock =
    rel.length > 0
      ? `\n## Relevant history (past preps / older dumps)\n${rel.slice(0, 4_000)}\n`
      : '';

  return `You format a DRAFT prep for Pem — paste-ready text for the user to send themselves.

${thoughtBlock}${memoryBlock}${historyBlock}
## Agent output (raw)
"""
${clipped}
"""

Return JSON matching the schema.

## summary
One line for the hub card — what Pem drafted (warm, specific).

## draftType
email | message | post | proposal | other — what fits the ask.

## subject
Email subject if applicable; otherwise "".

## body
The full draft — markdown-friendly plain text; ready to copy.

## tone
professional | casual | friendly | firm

## assumptions
One short line listing what you assumed (names, dates), or "" if none.`;
}

/** Synthesize agent trace into PLACE_CARD JSON (maps + local results from google()). */
export function buildPlaceCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  const mem = ctx?.memorySection?.trim() ?? '';
  const thought = ctx?.thoughtLine?.trim() ?? '';
  const rel = ctx?.relevantContextSection?.trim() ?? '';
  const memoryBlock =
    mem.length > 0
      ? `\n## User memory (constraints — never invent beyond this + agent output)\n${mem.slice(0, 6_000)}\n`
      : '';
  const thoughtBlock =
    thought.length > 0
      ? `\n## Place / local search ask\n${thought.slice(0, 800)}\n`
      : '';
  const historyBlock =
    rel.length > 0
      ? `\n## Relevant history (past preps / older dumps)\n${rel.slice(0, 4_000)}\n`
      : '';

  return `You format a FIND_PLACE prep for Pem — places to go or businesses to consider. The agent used google() (Maps + Tavily). Your job: turn that into **PLACE_CARD** JSON — not chat prose.

${thoughtBlock}${memoryBlock}${historyBlock}
## Agent output (raw)
"""
${clipped}
"""

Return JSON matching the schema exactly.

## summary
One warm line for the hub card (first person or direct "you").

## query
Short restatement of what we looked for (subtitle).

## recommendation
One line: Pem's pick or how to choose among the options — from agent data only.

## places (1–5 rows)
- **name**, **address**, **rating** (0–5), **reviewCount** (integer) — from google_maps / agent only; use 0 if unknown.
- **photo** — image URL from results if present; otherwise "".
- **lat**, **lng** — from Serp/maps data when present; use **0** and **0** if unknown (never guess coordinates).
- **priceRange**, **hours**, **phone** — from results or ""; never invent.
- **url** — Google Maps place link or official site from results; "" if none.
- **pemNote** — one short line why this place fits the ask (from context).

## mapCenterLat / mapCenterLng
Approximate center for a map preview: average of non-zero lat/lng among places, or first non-zero pair, or 0/0 if none.

Forbidden in any string: "Explore", "Discover", "I'd be happy to help".`;
}
