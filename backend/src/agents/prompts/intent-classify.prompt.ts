const INTENT_LINE = `SHOPPING | RESEARCH | DRAFT | COMPARISON | DECISION | LEGAL_FINANCIAL | LIFE_ADMIN | TASK_UNCLEAR | SUMMARIZE | FIND_PERSON | FIND_PLACE | SCHEDULE_PREP | CONTENT_IDEA | EXPLAIN | TRANSLATE_SIMPLIFY | TRACK_MONITOR`;

/** Build classification prompt for one thought (after split). */
export function buildIntentClassifyPrompt(thought: string): string {
  const t = thought.trim().slice(0, 8000);
  return `You are classifying a single "thought" from a user's brain dump for Pem, an AI prep assistant.

Infer the user's **goal** (what outcome they want), not surface keywords. Casual phrasing is fine — e.g. "need something for mom's birthday under $60" is SHOPPING; "what should I do about X vs Y" is often DECISION; "who runs product at Acme" is FIND_PERSON.

Classify into exactly ONE intent:

- SHOPPING — buy, need to buy, purchase, order, gift, product hunt, price, "what should I get", gear, subscriptions to purchase
- RESEARCH — deep dive with sources on a topic (not "explain one term" and not "summarize this paste")
- DRAFT — write an email, message, proposal, bio, caption, text to send
- COMPARISON — compare vendors, tools, plans, services, products side-by-side (not only "which one" — that can be DECISION if it's a personal choice)
- DECISION — choose between paths; what should I do; help me pick; pros/cons leading to a recommendation
- LEGAL_FINANCIAL — contracts, taxes, legal, money decisions needing care
- LIFE_ADMIN — logistics, moving, visa, appointments, renovation, bureaucracy steps
- TASK_UNCLEAR — too vague; need a clarifying question first
- SUMMARIZE — summarize a specific article, doc, contract, thread (user pasted text or gave a URL)
- FIND_PERSON — find someone: LinkedIn, who is CTO, head of sales at X, background on a person
- FIND_PLACE — local discovery: dentist near me, coworking under $X, restaurant, gym, service nearby
- SCHEDULE_PREP — prep for a meeting: investor, person, company briefing, "before my call with"
- CONTENT_IDEA — ideas for posts, what to write, angles for content
- EXPLAIN — explain a concept (S-corp, cap table); no web research unless "latest law"
- TRANSLATE_SIMPLIFY — rewrite/simplify pasted text, plain English
- TRACK_MONITOR — user wants ongoing alerts (price drop, job listing watch) — not MVP but classify if clearly stated

Tie-breakers:
- "Explain how X works" → EXPLAIN; "research X with sources" → RESEARCH
- "Compare A and B" → COMPARISON; "Should I pick A or B for my situation?" → DECISION
- Paste/URL + "summarize" → SUMMARIZE
- "Ideas for … post / thread / content" → CONTENT_IDEA

Thought:
"""
${t}
"""

Reply with JSON only: {"intent":"ONE_OF_ENUM"} where ONE_OF_ENUM is exactly one of:
${INTENT_LINE}`;
}
