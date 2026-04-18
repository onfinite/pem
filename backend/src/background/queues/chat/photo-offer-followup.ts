/**
 * Short replies that often mean "yes, do what you just offered" after Pem invited
 * turning a saved photo into inbox / list items (reference-only path).
 */
export function isShortPhotoIntentAffirmation(userContent: string): boolean {
  const t = userContent.trim();
  if (t.length > 40) return false;
  return /^(y(es)?|sure|ok(ay)?|yeah|yep|please|go ahead|do it)\s*[!.,?]*$/i.test(
    t,
  );
}

function recentThreadHasUserPhotoLine(
  recentMessages: { role: string; content: string }[],
): boolean {
  return recentMessages.some(
    (m) => m.role === 'user' && /\[Photo:/i.test(m.content),
  );
}

/** Pem invited organizing / list / inbox from a photo they just described. */
function lastPemBeforeUserOfferedPhotoTasks(
  recentMessages: { role: string; content: string }[],
): boolean {
  const last = recentMessages[recentMessages.length - 1];
  if (!last || last.role !== 'user') return false;
  for (let i = recentMessages.length - 2; i >= 0; i -= 1) {
    if (recentMessages[i].role === 'pem') {
      const pem = recentMessages[i].content;
      return /\b(let me know|inbox|shopping|tasks?|to-?dos?|add (these|them|the|what)|break it down|organize|turn.{0,28}into|pull out tasks|if these need)\b/i.test(
        pem,
      );
    }
  }
  return false;
}

/**
 * Triage may label bare "Yes" as trivial; we still need the agent so shopping lines
 * from the prior photo become creates.
 */
export function shouldEscalateTrivialForPhotoFollowup(
  userContent: string,
  recentMessages: { role: string; content: string }[],
): boolean {
  if (!isShortPhotoIntentAffirmation(userContent)) return false;
  if (!recentThreadHasUserPhotoLine(recentMessages)) return false;
  return lastPemBeforeUserOfferedPhotoTasks(recentMessages);
}
