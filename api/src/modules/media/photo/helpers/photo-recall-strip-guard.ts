import { LINK_HTTPS_URL_REGEX } from '@/core/utils/link-url-patterns';

const RECALL_OR_VISUAL_HINT =
  /\b(photo|picture|image|screenshot|remember|recall|uploaded|sent (you |a )?pic|that pic|that photo|from when|last time|which (one|shot)|show me what|from my (camera|gallery))\b/i;

/**
 * Fast reject for "From your photos" — vector + LLM recall should not run for
 * bare confirmations, direct list edits, generic "what's on my list now", or
 * "I'm done shopping" turns (no ask about past images).
 */
export function shouldSkipPhotoRecallStrip(userText: string): boolean {
  const t = userText.trim();

  /** Link shares (Amazon, articles): never surface unrelated past shopping photos. */
  if (/\bhttps?:\/\//i.test(t)) {
    const withoutUrls = t
      .replace(LINK_HTTPS_URL_REGEX, ' ')
      .replace(/[,\s]+/g, ' ')
      .trim();
    if (withoutUrls.length < 28 && !RECALL_OR_VISUAL_HINT.test(t)) {
      return true;
    }
  }

  if (t.length <= 28) {
    if (
      /^(y(es)?|sure|ok(ay)?|yeah|yep|please|go ahead|do it|got it)\s*[!.,?]*$/i.test(
        t,
      )
    ) {
      return true;
    }
  }

  if (
    /\b(i\s+)?(already\s+)?(bought|picked\s+up|got)\s+(everything|all\s+of\s+it|them\s+all|it\s+all|the\s+groceries|my\s+groceries)\b/i.test(
      t,
    ) ||
    /\b(done|finished)\s+(with\s+)?(shopping|groceries|costco)\b/i.test(t) ||
    /\ball\s+set\s+(with\s+)?(shopping|the\s+list|groceries)\b/i.test(t)
  ) {
    return true;
  }

  if (!RECALL_OR_VISUAL_HINT.test(t)) {
    if (
      /\b(what'?s?|what\s+is)\s+(on|in)\s+my\s+(shopping\s+)?list\b/i.test(t) ||
      /\bwhat\s+do\s+i\s+need(\s+to\s+buy)?(\s+from(\s+the)?\s+store)?\b/i.test(
        t,
      ) ||
      /\b(near|at)\s+[\w\s]{0,32}(what'?s?|what\s+is)\s+(on|in)\s+my\s+list\b/i.test(
        t,
      )
    ) {
      return true;
    }
  }

  if (
    /\b(add (these|them)|put (these|them) on|shopping list|to my list|to-do|inbox items?)\b/i.test(
      t,
    ) &&
    !RECALL_OR_VISUAL_HINT.test(t)
  ) {
    return true;
  }
  return false;
}
