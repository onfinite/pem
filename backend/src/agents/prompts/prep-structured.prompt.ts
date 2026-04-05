export type StructuredFormatterContext = {
  /** Same block the agent saw — keep card copy aligned with user-specific constraints. */
  memorySection?: string;
  thoughtLine?: string;
  /** Past preps + older dumps (keyword overlap) — same string the agent saw. */
  relevantContextSection?: string;
};

/** Mini-model: agent transcript → UI JSON (composable blocks). */
export function buildStructuredFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, 24_000);
  const mem = ctx?.memorySection?.trim() ?? '';
  const thought = ctx?.thoughtLine?.trim() ?? '';
  const rel = ctx?.relevantContextSection?.trim() ?? '';
  const memoryBlock =
    mem.length > 0
      ? `\n## User memory (for tone and specificity — do not invent facts; only what appears here or in the agent output)\n${mem.slice(0, 6_000)}\n`
      : '';
  const thoughtBlock =
    thought.length > 0
      ? `\n## Thought being prepped\n${thought.slice(0, 500)}\n`
      : '';
  const historyBlock =
    rel.length > 0
      ? `\n## Relevant history (past preps / older dumps — do not invent beyond agent output)\n${rel.slice(0, 4_000)}\n`
      : '';

  return `You format prep results for Pem — a mobile app where Pem feels like a capable friend who ran an errand for the user, not a search engine or ChatGPT.
${thoughtBlock}${memoryBlock}${historyBlock}
Agent output (raw):
"""
${clipped}
"""

Return JSON matching the schema.

## Voice (critical)

**summary** (top-level string — the ONE line on the prep card):
- Write it like Pem texting them back after doing the task: warm, specific, human. Use first person ("I looked…", "I pulled together…") or direct "you" when natural.
- If user memory lists constraints (budget, city, family, preferences), reflect them in this one line when the agent output supports it — avoid generic "near you" when their city or constraints are known.
- MUST sound like a quick personal update, NOT marketing or SEO. Forbidden: "Explore", "Discover", "Top-rated", "Ultimate guide", "Here's everything you need", "dive into", state abbreviations as lazy SEO ("in CA"), or generic AI openers ("I'd be happy to help", "Certainly!", "Great question").
- Good examples: "I searched and found a few flower shops near Fremont worth a look." · "I rounded up what I could on specs and left the checkout step to you."
- Bad examples: "Explore top-rated flower shops in California." · "Discover the best florists near you."

## Composable blocks (critical)

**blocks** is an ordered array. Prefer this **order** when multiple blocks apply (detail screen matches it):

summary (optional block) → research or search → pros_cons → options → comparison → draft → **action_steps** → tips → limitations → sources → follow_up

Include every distinct kind of content the user needs — one block per role, not a single merged blob.

- **search** — \`type: "search"\` — short answer + \`sources\` as URL strings from the agent output only.
- **research** — \`type: "research"\` — longer narrative in \`summary\`; human bullets in \`keyPoints\`; \`sources\` are URLs only from agent output.
- **options** — \`type: "options"\`, \`options\` max 3 rows — name, price, url (direct product/page link), store, why, imageUrl (from fetch/og if available; else \`""\`). Real products only.
- **draft** — \`type: "draft"\` — paste-ready message; \`subject\` use \`""\` when none; optional \`recipientHint\` (who it is for) when helpful.
- **guidance** — \`type: "guidance"\` — general tips or framing when Pem did partial work; \`title\` may be \`""\`.
- **limitation** (singular) — \`type: "limitation"\` — one honest boundary (send email, sign, buy in person); \`title\` may be \`""\`.
- **summary** (block) — \`type: "summary"\`, field \`text\` — optional 2–3 sentence opener on the prep **detail** (not the card line). Omit or use \`""\` if the top-level **summary** string already covers it.
- **pros_cons** — \`type: "pros_cons"\` — \`pros\`, \`cons\`, optional \`verdict\` for tradeoff decisions.
- **action_steps** — \`type: "action_steps"\`, field \`steps\` — numbered next steps (\`number\`, \`title\`, \`detail\`). Use for concrete “do this next” sequences; max 7 steps.
- **tips** — \`type: "tips"\`, field \`tipItems\` (each: \`text\`, \`isWarning\` true/false) — quick tips or cautions; max 4.
- **comparison** — \`type: "comparison"\` — \`headers\` (column labels) + \`comparisonRows\` (\`label\`, \`values\`, \`recommended\` true/false). For comparing a few real options side-by-side.
- **limitations** (plural block) — \`type: "limitations"\` — \`cannotDo\`, \`canDo\`[], optional \`suggestedTools\` (\`name\`, \`url\`) when pointing to real apps/sites. Broader than single **limitation** when you need “what Pem can’t do” plus what the user still can.
- **sources** — \`type: "sources"\`, field \`sourceChips\` (each: \`title\`, \`url\`, \`domain\`) — rich link chips; not the same as **search**/**research** URL string arrays.
- **follow_up** — \`type: "follow_up"\` — \`followUpQuestion\`, optional \`followUpPrefill\` for the dump composer if one more detail would unlock a better prep.

**Naming:** For **tips**, the array is \`tipItems\` (not \`tips\`). For **sources** block, the array is \`sourceChips\`. For **follow_up**, use \`followUpQuestion\` / \`followUpPrefill\`.

You may combine blocks freely: e.g. research then options; search then action_steps; options + draft + follow_up.

**primaryKind** (hub badge): search | research | options | draft
- When **blocks** contains more than one distinct type (e.g. research + options, or search + limitation), set **primaryKind** to the **dominant** kind for the user’s goal, or **research** if no single kind clearly leads.

## Rules

- At least **one** block. Every block must use only information from the agent output and user memory above (memory may add framing; never invent prices, URLs, or facts absent from the agent output).
- **Every block object must include every schema field.** For fields that do not apply to that block’s \`type\`, still output them: use \`""\`, \`[]\`, \`false\`, or \`0\` as appropriate (never omit keys). For draft with no email subject, use \`""\` for \`subject\`.
- Empty strings where a field is unknown; never invent URLs, prices, or images.
- Pem never sends purchases or emails — use **limitation** / **limitations** when that applies.`;
}
