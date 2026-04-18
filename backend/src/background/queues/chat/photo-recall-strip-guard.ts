/**
 * Fast reject for "From your photos" — vector + LLM recall should not run for
 * bare confirmations or direct list edits with no ask about past images.
 */
export function shouldSkipPhotoRecallStrip(userText: string): boolean {
  const t = userText.trim();
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
    /\b(add (these|them)|put (these|them) on|shopping list|to my list|to-do|inbox items?)\b/i.test(
      t,
    ) &&
    !/\b(photo|picture|image|screenshot|show me|remember when|from my trip|from last)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  return false;
}
