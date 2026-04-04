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
    case 'EVENTS':
    case 'FLIGHTS':
    case 'BUSINESS':
    case 'TRENDS':
    case 'MARKET':
    case 'JOBS':
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
        'Call **google()** with the right **vertical** (SerpAPI + Tavily): `web`, `news`, `images` or faster `images_light`, `jobs`, `finance`, `maps`, `local`, `local_services`, `shopping`, `events` (concerts/festivals), `flights` (query `flight|DEP|ARR|YYYY-MM-DD`), `hotels` (`hotel|City|check_in|check_out`), `forums`, `travel_explore`, `trends`, `scholar` (academic), `maps_reviews` (`reviews|DATA_ID`), `amazon_product`, `apple_app_store`, `home_depot`, `immersive_product`, `facebook_profile` — pick what matches the ask.',
        'Deliver summary, key facts, cited sources, bullet takeaways.',
        'If the user really wanted **restaurants, bars, or local venues** (a list of places to go), use **maps** or **local** — venue shortlists belong in **FIND_PLACE** when the thought was misclassified.',
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
        'You may use **google()** with `finance`, `news`, `web`, `scholar`, or `forums` for structured data — never fabricate citations.',
      );
      break;
    case 'LIFE_ADMIN':
      lines.push(
        'Step-by-step, actionable. For **local pros** use `local_services` or `maps`; for **travel** use `flights`, `hotels`, or `travel_explore`; for **money/taxes** use `finance` or `news`; otherwise `web` or **search()** (Tavily) for process and logistics.',
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
        'Default: **google()** with `vertical: maps` — structured **Google Maps** results (ratings, address, coordinates, photos). When the user message includes **session device coordinates**, the backend **centers SerpAPI Maps on that point** — your query should describe what to find (e.g. "Italian restaurants", "coffee shops") and not rely on the phrase "near me" alone.',
        'For **events** (concerts, festivals this weekend), use `vertical: events` with a location in the query. For **local pack**-style SMB discovery you may use `local` or `local_services`. For **trip ideas** try `travel_explore`. For **review text** after you have a Maps `data_id`, use `maps_reviews` with `reviews|DATA_ID`.',
        'When **device location is unavailable**, lean on **memory_facts** (memory block + **remember()** for city, location, home, work area, etc.) before asking the user for a city — tailor maps/search to that place when present.',
        'Use **search()** for extra context. If memory has a home city and no session coordinates, use that city in queries. Clear pick when possible.',
        'Phrasing like **find, search, look up, best, top, good** with **restaurants, bars, cafes, hotels, salons, gyms, venues** still means this lane — **maps** is the default tool, not a generic web article.',
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
    case 'EVENTS':
      lines.push(
        'Call **google()** with `vertical: events` first — real events with dates/venues. Use **search()** for extra context. Never invent ticket links.',
      );
      break;
    case 'FLIGHTS':
      lines.push(
        'Call **google()** with `vertical: flights` — query must use **flight|DEP|ARR|YYYY-MM-DD**. Add **hotels** or **travel_explore** if the user also needs stays. Never invent fares.',
      );
      break;
    case 'BUSINESS':
      lines.push(
        'Call **google()** with `vertical: local`, `local_services`, or `maps` — prioritize **ratings, review counts, and real contact info**. Use **forums** or **web** via **search()** only to summarize customer sentiment when proposing options.',
      );
      break;
    case 'TRENDS':
      lines.push(
        'Call **google()** with `vertical: trends` for the keyword; add `news` or `web` if context helps. Describe momentum honestly — do not fabricate numbers.',
      );
      break;
    case 'MARKET':
      lines.push(
        'Call **google()** with `vertical: finance` for quotes; add `news` for catalysts. Not personalized investment advice — cite sources.',
      );
      break;
    case 'JOBS':
      lines.push(
        'Call **google()** with `vertical: jobs` first; add `web` for employer reputation. Real apply links only.',
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
    case 'LEGAL_FINANCIAL':
    case 'FIND_PLACE':
    case 'FIND_PERSON':
    case 'SCHEDULE_PREP':
    case 'LIFE_ADMIN':
    case 'EVENTS':
    case 'FLIGHTS':
    case 'BUSINESS':
    case 'TRENDS':
    case 'MARKET':
    case 'JOBS':
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
