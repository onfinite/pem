import type { PrepType } from '../../database/schemas';

import type { PrepIntent } from './prep-intent';

/** Initial DB `prep_type` before structured output overwrites — legacy bucket. */
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
        'Find real products with **direct retailer purchase links** (Amazon, Target, Walmart, Best Buy, official brand store — actual product detail pages /dp/ /p/ etc.).',
        'Do **not** use as the product link: Google Shopping or Google search result URLs, Google Maps, Yelp, TripAdvisor, store locators, "near me" pages, or blog roundup pages — unless the user explicitly asked for local pickup; default is **online buy**.',
        'Use search() with product + retailer or "buy online"; use fetch() on **retailer PDPs** to verify price and image. Max 3 options. End with a clear recommendation.',
      );
      break;
    case 'RESEARCH':
      lines.push(
        'Search for credible sources. Deliver summary, key facts, cited sources, bullet takeaways.',
      );
      break;
    case 'DRAFT':
      lines.push(
        'Produce paste-ready text. Use draft() when helpful. One line on assumptions.',
      );
      break;
    case 'COMPARISON':
      lines.push(
        'Compare options with a side-by-side view and a winner recommendation.',
      );
      break;
    case 'DECISION':
      lines.push(
        'Structured pros/cons and data; end with "My take:" and a direct recommendation.',
      );
      break;
    case 'LEGAL_FINANCIAL':
      lines.push(
        'Plain English; prefer authoritative sources; say when a human professional is needed.',
      );
      break;
    case 'LIFE_ADMIN':
      lines.push(
        'Step-by-step, actionable; search for specific logistics when needed.',
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
        'People discovery: role, company, best public profile links. Never invent email/phone.',
      );
      break;
    case 'FIND_PLACE':
      lines.push(
        'Local/service discovery with constraints (location, price). Clear pick when possible.',
      );
      break;
    case 'SCHEDULE_PREP':
      lines.push(
        'Meeting prep: who, company context, talking points, risks — scannable briefing.',
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
