const INTENT_LINE = `SHOPPING | RESEARCH | DRAFT | COMPARISON | DECISION | LEGAL_FINANCIAL | LIFE_ADMIN | TASK_UNCLEAR | SUMMARIZE | FIND_PERSON | FIND_PLACE | SCHEDULE_PREP | CONTENT_IDEA | EXPLAIN | TRANSLATE_SIMPLIFY | TRACK_MONITOR`;

/** Build classification prompt for one thought (after split). */
export function buildIntentClassifyPrompt(thought: string): string {
  const t = thought.trim().slice(0, 8000);
  return `You are classifying a single "thought" from a user's brain dump for Pem, an AI prep assistant.

Infer the user's **goal** (what outcome they want), not surface keywords. Casual phrasing is fine — e.g. "need something for mom's birthday under $60" is SHOPPING; "what should I do about X vs Y" is often DECISION; "who runs product at Acme" is FIND_PERSON.

Classify into exactly ONE intent:

- SHOPPING — buy a **product** or subscription: purchase, order, gift, gear, price, "what should I get" for a **thing** (not a venue to visit)
- RESEARCH — deep dive **on a topic** with sources: trends, history, policy, industry analysis, "how does X work in the industry" — **not** a shortlist of places to go
- DRAFT — write an email, message, proposal, bio, caption, text to send
- COMPARISON — compare **products, tools, plans, services as SKUs** side-by-side (not "which two restaurants" — those are FIND_PLACE or DECISION about venues)
- DECISION — choose between **abstract paths** or **non-venue** options; if the question is "which restaurant / bar / hotel should I pick" and they need **real venues**, prefer FIND_PLACE
- LEGAL_FINANCIAL — contracts, taxes, legal, money decisions needing care
- LIFE_ADMIN — logistics, moving, visa, appointments, renovation, bureaucracy steps **without** a primary "show me places on a map" ask
- TASK_UNCLEAR — too vague; need a clarifying question first
- SUMMARIZE — summarize a specific article, doc, contract, thread (user pasted text or gave a URL)
- FIND_PERSON — find someone: LinkedIn, who is CTO, head of sales at X, background on a person
- FIND_PLACE — **local / venue / service discovery**: where to eat, drink, stay, get a haircut, work out, see a dentist, coworking, **best/top restaurants in [city]**, **find me coffee near X**, **search for date night spots**, **good brunch places**, **hotel in [area]** — verbs like **find, search, look up, get, recommend** still count; **ignore the verb** and choose **FIND_PLACE** whenever the user wants **concrete places** (maps, ratings, addresses), not a research report
- SCHEDULE_PREP — prep for a meeting: investor, person, company briefing, "before my call with"
- CONTENT_IDEA — ideas for posts, what to write, angles for content
- EXPLAIN — explain a concept (S-corp, cap table); no web research unless "latest law"
- TRANSLATE_SIMPLIFY — rewrite/simplify pasted text, plain English
- TRACK_MONITOR — ongoing alerts (price drop, job listing watch) — not MVP but classify if clearly stated

**Venues vs research (critical):**
- "Best restaurants in Austin", "top coffee shops near me", "find a good bar in Brooklyn", "where should we eat tonight", "search hotels in Tokyo under $200" → **FIND_PLACE**
- "Research the restaurant industry in Texas", "history of fine dining in Paris", "why are restaurants raising prices" → **RESEARCH**
- "Compare Nobu vs Masa" — if they mean **the restaurants as places to book** → **FIND_PLACE**; if comparing **business models** or **chains as investments** → **COMPARISON** or **RESEARCH**

Tie-breakers:
- "Explain how X works" → EXPLAIN; "research X with sources" (topic, not venue list) → RESEARCH
- **Any ask for a list of real places** (restaurants, bars, cafes, hotels, salons, gyms, venues) → FIND_PLACE unless the pasted text is the only input (SUMMARIZE)
- Paste/URL + "summarize" → SUMMARIZE
- "Ideas for … post / thread / content" → CONTENT_IDEA

Thought:
"""
${t}
"""

Reply with JSON only: {"intent":"ONE_OF_ENUM"} where ONE_OF_ENUM is exactly one of:
${INTENT_LINE}`;
}
