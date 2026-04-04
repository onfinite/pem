import type { PrepIntent } from './prep-intent';

/**
 * Heuristic: user wants concrete venues / local businesses (maps), not a research report.
 * Used after the model to fix common RESEARCH/COMPARISON/DECISION misfires on "best restaurants", etc.
 */
export function looksLikePlaceDiscovery(thought: string): boolean {
  const t = thought.trim();
  if (t.length === 0) return false;

  // Explicitly *not* venue discovery — keep RESEARCH / EXPLAIN / etc.
  if (
    /\b(history|historical|evolution|economics?|research paper|academic|dissertation|thesis|industry report)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  if (
    /\b(how|why)\s+(does|do|is|are)\s+.*\b(restaurant|hospitality|hotel)\b/i.test(
      t,
    )
  ) {
    return false;
  }

  // Strong venue / local intent
  if (/\bwhere\s+to\s+(eat|drink|stay|brunch|have\s+dinner)\b/i.test(t))
    return true;
  if (/\b(date\s+night|romantic)\s+(spot|restaurant|place|dinner)\b/i.test(t))
    return true;
  if (
    /\b(near\s+me|around\s+here|in\s+my\s+area)\b/i.test(t) &&
    /\b(eat|food|restaurant|coffee\s+shops?|brunch|bar|drink|dinner|lunch)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  if (
    /\b(best|top|greatest|favorite|favourite|good|great|nice)\s+(\d+\s+)?(restaurant|restaurants|cafes?|coffee\s+shops?|bars?|eateries|brunch\s+spots?|spots?)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  if (
    /\b(find|finding|search|searching|look\s+for|looking\s+for|get\s+me|suggest|recommend|recommendations?)\b/i.test(
      t,
    ) &&
    /\b(restaurant|restaurants|cafes?|coffee\s+shops?|bar|bars|brunch|food|eat|eating|dinner|lunch|hotel|hotels|stay|venue|venues|place\s+to\s+eat)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  if (
    /\b(restaurant|restaurants|cafes?|coffee\s+shops?|bars?|brunch|bakery|brewery|hotel|hotels|salon|gym|spa)\s+(in|near|around|at)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  return false;
}

/**
 * If the model picked a lane that yields the wrong card (e.g. RESEARCH → research card),
 * bump to FIND_PLACE when the text is clearly venue discovery.
 */
export function adjustIntentForPlaceDiscovery(
  thought: string,
  intent: PrepIntent,
): PrepIntent {
  if (!looksLikePlaceDiscovery(thought)) return intent;

  // Do not override intents with a different primary deliverable
  const skip: PrepIntent[] = [
    'SUMMARIZE',
    'TASK_UNCLEAR',
    'DRAFT',
    'TRANSLATE_SIMPLIFY',
    'EXPLAIN',
    'FIND_PERSON',
    'FIND_PLACE',
    'SCHEDULE_PREP',
    'CONTENT_IDEA',
    'TRACK_MONITOR',
    'LEGAL_FINANCIAL',
    'EVENTS',
    'FLIGHTS',
    'BUSINESS',
    'TRENDS',
    'MARKET',
    'JOBS',
  ];
  if (skip.includes(intent)) return intent;

  if (
    intent === 'RESEARCH' ||
    intent === 'COMPARISON' ||
    intent === 'DECISION' ||
    intent === 'LIFE_ADMIN'
  ) {
    return 'FIND_PLACE';
  }

  // Model sometimes picks SHOPPING for "best coffee shops" — venues belong on PLACE_CARD.
  if (intent === 'SHOPPING') {
    return 'FIND_PLACE';
  }

  return intent;
}
