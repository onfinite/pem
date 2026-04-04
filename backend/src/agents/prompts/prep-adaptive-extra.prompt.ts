import type { StructuredFormatterContext } from './prep-structured.prompt';

const CLIP = 28_000;

function blocks(ctx?: StructuredFormatterContext): string {
  const mem = ctx?.memorySection?.trim() ?? '';
  const thought = ctx?.thoughtLine?.trim() ?? '';
  const rel = ctx?.relevantContextSection?.trim() ?? '';
  const memoryBlock =
    mem.length > 0
      ? `\n## User memory (constraints — never invent beyond agent output)\n${mem.slice(0, 6_000)}\n`
      : '';
  const thoughtBlock =
    thought.length > 0 ? `\n## Thought\n${thought.slice(0, 800)}\n` : '';
  const historyBlock =
    rel.length > 0
      ? `\n## Relevant history (past preps / older dumps)\n${rel.slice(0, 4_000)}\n`
      : '';
  return `${thoughtBlock}${memoryBlock}${historyBlock}`;
}

export function buildComparisonCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, CLIP);
  return `You format a COMPARISON prep for Pem (mobile). Turn agent output into **COMPARISON_CARD** JSON — Wirecutter-style, not chat.

${blocks(ctx)}
## Agent output
"""
${clipped}
"""

Rules:
- **criteria**: column labels for the comparison (e.g. Price, Battery, Support).
- **options**: 2–4 named things being compared; **scores** is an object mapping each criterion name → 1–5 number.
- **winner** must match one option **name** exactly.
- **winnerReason**: one tight paragraph from evidence only.
- Real data from agent only; empty strings where unknown.
- **summary**: one hub-card line.

Forbidden: "Explore", "I'd be happy to help".`;
}

export function buildResearchCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, CLIP);
  return `You format a RESEARCH prep for Pem — **RESEARCH_CARD** JSON: article-like, cited, scannable.

${blocks(ctx)}
## Agent output
"""
${clipped}
"""

Fields:
- **topic**, **executiveSummary** (3–5 sentences), **keyFacts** (bullets, ≥1).
- **sections**: optional titled subsections with markdown-friendly **content**.
- **sources**: { title, url } from agent only; omit bad URLs.
- **lastUpdated**: "" or a short note like "as of 2026" if inferable.
- **summary**: one line for the hub card.`;
}

export function buildPersonCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, CLIP);
  return `You format a FIND_PERSON prep — **PERSON_CARD** JSON (LinkedIn-style identity card).

${blocks(ctx)}
## Agent output
"""
${clipped}
"""

Rules:
- **photo**, **companyLogo**: real image URLs from agent/Serp only; **""** if none — never guess a face.
- **photo**: do **not** use LinkedIn CDN URLs (licdn.com, media.licdn.com) — they return 403 in mobile apps. Prefer company press pages, conference headshots, or **""**.
- **bio**: synthesized from sources; no invented employers.
- **recentActivity**: short bullets (posts, talks, news) or [].
- **linkedin**, **twitter**, **website**: public URLs only or "".
- **summary**: hub line.`;
}

export function buildMeetingBriefFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, CLIP);
  return `You format a SCHEDULE_PREP / meeting prep — **MEETING_BRIEF** JSON.

${blocks(ctx)}
## Agent output
"""
${clipped}
"""

Include: **meetingWith**, **company**, **about** (company 2–3 sentences), **personBackground**, **recentNews** (headlines/snippets, last ~30 days when agent had them), **suggestedTalkingPoints**, **thingsToAvoid**, **pemNote**.
**photo** / **companyLogo**: URLs from agent only or "". Do **not** use LinkedIn CDN (licdn.com) for **photo** — use "" or a public headshot URL.
**summary**: hub line.`;
}

export function buildDecisionCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, CLIP);
  return `You format a DECISION prep — **DECISION_CARD** JSON: verdict-first.

${blocks(ctx)}
## Agent output
"""
${clipped}
"""

- **verdict**: direct ("Go with X").
- **verdictReason**: short paragraph.
- **options**: ≥2 with pros/cons arrays.
- **keyData**: bullet data points.
- **confidence**: high | medium | low — lower if thin sources.
- **summary**: hub line.`;
}

export function buildLegalFinancialCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, CLIP);
  return `You format LEGAL_FINANCIAL — **LEGAL_FINANCIAL_CARD** JSON.

${blocks(ctx)}
## Agent output
"""
${clipped}
"""

- **plainEnglish**: main explainer users read first.
- **clauses**: titled chunks of dense text when the agent had policy/legal detail.
- **caveats**: "not legal advice" / limits.
- **sources**: authoritative links only.
- **summary**: hub line.`;
}

export function buildExplainCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, CLIP);
  return `You format EXPLAIN — **EXPLAIN_CARD** JSON (HowStuffWorks-style: clear, structured).

${blocks(ctx)}
## Agent output
"""
${clipped}
"""

- **tldr**: one sentence.
- **explanation**: main body (plain language).
- **steps** if sequential; **analogy** if helpful or "".
- **commonMistakes**: short bullets or [].
- **summary**: hub line.`;
}

export function buildSummaryCardFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, CLIP);
  return `You format SUMMARIZE — **SUMMARY_CARD** JSON (Matter-style highlights).

${blocks(ctx)}
## Agent output
"""
${clipped}
"""

- **sourceUrl** / **sourceTitle**: from user URL or agent; "" if pasted text only.
- **readingTime**: "" or e.g. "4 min".
- **tldr**, **keyPoints**, optional **pullQuote**.
- **sentiment**: positive | negative | neutral | mixed.
- **summary**: hub line.`;
}

export function buildIdeaCardsFormatterPrompt(
  agentText: string,
  ctx?: StructuredFormatterContext,
): string {
  const clipped = agentText.slice(0, CLIP);
  return `You format CONTENT_IDEA — **IDEA_CARDS** JSON (swipeable idea deck).

${blocks(ctx)}
## Agent output
"""
${clipped}
"""

- **context**: one line framing the content goal.
- **ideas**: 1–12 items with **title**, **hook** (opening line), **angle**, **format** (carousel | story | thread | post | "").
- **summary**: hub line.`;
}
