import type { PrepType } from '../../database/schemas';

import type { PrepIntent } from './prep-intent';

/** Initial DB `prep_type` before the agent overwrites with the final bucket. */
export function initialPrepTypeForIntent(intent: PrepIntent): PrepType {
  switch (intent) {
    case 'DRAFT':
    case 'CONTENT_IDEA':
    case 'TRANSLATE_SIMPLIFY':
      return 'draft';
    case 'SHOPPING':
    case 'COMPARISON':
      return 'options';
    case 'RESEARCH':
    case 'DECISION':
    case 'LEGAL_FINANCIAL':
    case 'SCHEDULE_PREP':
      return 'research';
    default:
      return 'search';
  }
}

/** Extra system instructions for the prep agent (intent lane). */
export function intentSystemAddendum(intent: PrepIntent): string {
  const lines: string[] = [
    `Intent for this prep: **${intent}**. Follow this lane:`,
  ];

  switch (intent) {
    case 'SHOPPING':
      lines.push(
        'Call **google()** first with `vertical: shopping` — JSON includes **google_shopping** (Google Shopping) **and** **amazon_search** (Amazon PDPs) in parallel. Those arrays are your **only** sources for real product names, prices, thumbnails, and **buy links**.',
        'In your final answer, surface **at least two distinct products** when either array has 2+ rows — never a single news or magazine URL (e.g. today.com, CNN) as the only “buy” link.',
        'Use **search()** (Tavily) only for supplemental expert reviews or buying guides after google(). Use **fetch()** on real retailer PDP URLs (Amazon /dp/, Target /p/, etc.) to verify price and image.',
        'Do **not** use blog-only or maps links as the product purchase URL. Max 3 options. End with a clear recommendation.',
      );
      break;
    case 'RESEARCH':
      lines.push(
        'Call **google()** with the right **vertical**: `web` (general SERP), `news` (headlines), `images` (visual search), `jobs` (role hiring), `finance` (ticker/price), `maps` (places), `shopping` (products + Amazon). SerpAPI + Tavily run in parallel — pick the vertical that matches the question.',
        'Deliver summary, key facts, cited sources, bullet takeaways.',
      );
      break;
    case 'DRAFT':
      lines.push(
        'Produce paste-ready text. Use draft() when helpful. One line on assumptions.',
      );
      break;
    case 'COMPARISON':
      lines.push(
        'Use **google()** with `vertical: shopping` for product comparisons when relevant, or `web` / `news` / `maps` / `finance` / `jobs` / `images` as needed. Compare options with a side-by-side view and a winner recommendation.',
      );
      break;
    case 'DECISION':
      lines.push(
        'Use **google()** with the vertical that fits (often `web`, `shopping`, or `finance`). Structured pros/cons and data; end with "My take:" and a direct recommendation.',
      );
      break;
    case 'LEGAL_FINANCIAL':
      lines.push(
        'Plain English; prefer authoritative sources; say when a human professional is needed.',
      );
      break;
    case 'LIFE_ADMIN':
      lines.push(
        'Step-by-step, actionable. If the ask involves a **place** (contractor, office, service), call **google()** with `vertical: maps`; otherwise `vertical: web` or rely on **search()** (Tavily) for process and logistics.',
      );
      break;
    case 'TASK_UNCLEAR':
      lines.push(
        'Do not pretend you have enough detail. Ask one short, friendly clarifying question first.',
      );
      break;
    case 'SUMMARIZE':
      lines.push(
        'If the user pasted text or gave a URL, base the answer on that input (use fetch for URLs). Do not replace with a generic web search on the topic.',
      );
      break;
    case 'FIND_PERSON':
      lines.push(
        'Call **google()** with `vertical: web` first (organic results + knowledge-style links), then use **search()** for synthesis. People discovery: role, company, best public profile links. Never invent email/phone.',
      );
      break;
    case 'FIND_PLACE':
      lines.push(
        'Call **google()** with `vertical: maps` first — structured **Google Maps** results (ratings, address, coordinates, photos). Use **search()** for extra context. Respect user location from memory when they said “near me”. Clear pick when possible.',
      );
      break;
    case 'SCHEDULE_PREP':
      lines.push(
        'Call **google()** with `vertical: web` — bundled **recent news** (past month) + Tavily company/person background. Meeting prep: who, company, talking points, risks — scannable briefing.',
      );
      break;
    case 'CONTENT_IDEA':
      lines.push(
        'Ideas, angles, hooks; optional trends via search — not a full draft unless asked.',
      );
      break;
    case 'EXPLAIN':
      lines.push(
        'Explain clearly from knowledge. Do NOT use search() unless the user needs current law/policy or says "latest".',
      );
      break;
    case 'TRANSLATE_SIMPLIFY':
      lines.push(
        'Rewrite the user’s text in plain English. Do NOT use search() — work from the thought text.',
      );
      break;
    case 'TRACK_MONITOR':
      lines.push(
        '(Handled upstream — if you see this, say monitoring is not available yet.)',
      );
      break;
    default:
      lines.push('Use tools as needed; synthesize — never a bare link list.');
  }

  return `${lines.join('\n')}

Apply **memory** for this lane: use the memory block and remember()/save() so budgets, locations, names, and preferences carry in — not generic advice.`;
}

/** Whether to expose the web search tool for this intent. */
export function intentAllowsSearch(intent: PrepIntent): boolean {
  switch (intent) {
    case 'EXPLAIN':
    case 'TRANSLATE_SIMPLIFY':
    case 'TASK_UNCLEAR':
      return false;
    default:
      return true;
  }
}

/** SerpAPI (Google Shopping / Maps / organic) — structured data; see `pem-search-provider-routing.mdc`. */
export function intentAllowsGoogleSerp(intent: PrepIntent): boolean {
  switch (intent) {
    case 'SHOPPING':
    case 'RESEARCH':
    case 'COMPARISON':
    case 'DECISION':
    case 'FIND_PLACE':
    case 'FIND_PERSON':
    case 'SCHEDULE_PREP':
    case 'LIFE_ADMIN':
      return true;
    default:
      return false;
  }
}

/** Whether to expose fetch(URL) for this intent. */
export function intentAllowsFetch(intent: PrepIntent): boolean {
  switch (intent) {
    case 'EXPLAIN':
    case 'TRANSLATE_SIMPLIFY':
    case 'TASK_UNCLEAR':
    case 'TRACK_MONITOR':
      return false;
    default:
      return true;
  }
}
