import type { StructuredFormatterContext } from './prep-structured.prompt';

/** Synthesize agent trace into SHOPPING_CARD JSON (after tools ran). */
export function buildShoppingCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 28_000);
  const mem = ctx?.memorySection?.trim() ?? '';
  const thought = ctx?.thoughtLine?.trim() ?? '';
  const memoryBlock =
    mem.length > 0
      ? `\n## User memory (constraints — never invent beyond this + agent output)\n${mem.slice(0, 6_000)}\n`
      : '';
  const thoughtBlock =
    thought.length > 0
      ? `\n## What they want to buy / compare\n${thought.slice(0, 800)}\n`
      : '';

  return `You format a SHOPPING prep for Pem — a mobile app. The agent already searched and (maybe) fetched pages. Your job: turn that into a tight **shopping card** JSON — not chat prose.

${thoughtBlock}${memoryBlock}
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

## products (1–3 rows)
- Real products only — names, prices, URLs, images from the agent output **only**. If the agent lacked an image URL, use "" for image.
- **url** must be a **direct retailer product page** where someone can add-to-cart or buy (e.g. amazon.com/dp/…, target.com/p/…, walmart.com/ip/…, bestbuy.com/site/…, brand.com product URL).
- **Never** put in **url**: Google Shopping (shopping.google.com), Google Maps, Yelp, TripAdvisor, Yellow Pages, Facebook Marketplace browse, or generic Google/Bing **search** result URLs — use "" if the agent only had those; do not guess a retailer URL.
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
  const memoryBlock =
    mem.length > 0 ? `\n## User memory\n${mem.slice(0, 6_000)}\n` : '';
  const thoughtBlock =
    thought.length > 0 ? `\n## Writing task\n${thought.slice(0, 800)}\n` : '';

  return `You format a DRAFT prep for Pem — paste-ready text for the user to send themselves.

${thoughtBlock}${memoryBlock}
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
