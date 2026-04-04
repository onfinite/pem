const INTENT_LINE = `SHOPPING | RESEARCH | DRAFT | COMPARISON | DECISION | LEGAL_FINANCIAL | LIFE_ADMIN | TASK_UNCLEAR | SUMMARIZE | FIND_PERSON | FIND_PLACE | SCHEDULE_PREP | CONTENT_IDEA | EXPLAIN | TRANSLATE_SIMPLIFY | TRACK_MONITOR`;

/** Build classification prompt for one thought (after split). */
export function buildIntentClassifyPrompt(thought: string): string {
  const t = thought.trim().slice(0, 8000);
  return `You are classifying a single "thought" from a user's brain dump for Pem, an AI prep assistant.

Classify into exactly ONE intent:

- SHOPPING — buy something, find a product, compare prices
- RESEARCH — deep dive with sources on a topic (not "explain one term" and not "summarize this paste")
- DRAFT — write an email, message, proposal, bio, caption
- COMPARISON — compare vendors, tools, plans, services
- DECISION — choose between options; pros/cons
- LEGAL_FINANCIAL — contracts, taxes, legal, money decisions needing care
- LIFE_ADMIN — logistics, moving, visa, appointments, renovation
- TASK_UNCLEAR — too vague; need a clarifying question first
- SUMMARIZE — summarize a specific article, doc, contract, thread (user pasted text or gave a URL)
- FIND_PERSON — find someone: LinkedIn, who is CTO, head of sales at X
- FIND_PLACE — local discovery: dentist near me, coworking under $X, etc.
- SCHEDULE_PREP — prep for a meeting: investor, person, company briefing
- CONTENT_IDEA — ideas for posts, what to write this week
- EXPLAIN — explain a concept (S-corp, cap table); no web research unless "latest law"
- TRANSLATE_SIMPLIFY — rewrite/simplify pasted text, plain English
- TRACK_MONITOR — user wants ongoing alerts (price drop, job listing watch) — not MVP but classify if clearly stated

Thought:
"""
${t}
"""

Reply with JSON only: {"intent":"ONE_OF_ENUM"} where ONE_OF_ENUM is exactly one of:
${INTENT_LINE}`;
}
