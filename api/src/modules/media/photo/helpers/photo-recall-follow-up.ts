/**
 * Follow-ups like "bring up the photo" carry no topic — include recent chat
 * so classifiers and image search can resolve "the photo" → the topic in the prior turn.
 */
export function needsPhotoRecallConversationTail(userText: string): boolean {
  const t = userText.trim();
  if (t.length > 240) return false;
  if (
    !/\b(photo|photos|picture|pictures|image|images|screenshot|screenshots|pic)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return (
    /\b(the|that|same|it|this|those|these)\b/i.test(t) ||
    /\b(bring|show|pull|open|see|display|resend|again|back)\b/i.test(t) ||
    /\b(shared|sent|posted|uploaded|attached)\b/i.test(t) ||
    /\blast\b/i.test(t) ||
    /\babout\b/i.test(t)
  );
}

/** User is clearly asking for a previously sent image; run image search even if the LLM said no. */
export function isExplicitPastPhotoRequest(userText: string): boolean {
  const t = userText.trim();
  if (t.length > 220) return false;
  if (
    !/\b(photo|photos|picture|pictures|image|images|screenshot|pic)\b/i.test(t)
  ) {
    return false;
  }
  return (
    /\b(bring|show|pull|open|see|display|send|find|surface)\b/i.test(t) ||
    /\b(the|that|same)\s+(photo|picture|image|pic|shot)\b/i.test(t)
  );
}

/**
 * Past-image recall phrasing that should not depend on the LLM classifier alone
 * (e.g. "photos I've shared about LA and nature").
 */
export function isLikelyPastImageRecallRequest(userText: string): boolean {
  if (isExplicitPastPhotoRequest(userText)) return true;
  const t = userText.trim();
  if (t.length > 280) return false;
  if (
    !/\b(photo|photos|picture|pictures|image|images|screenshot|pics?)\b/i.test(
      t,
    )
  ) {
    return false;
  }
  return (
    /\b(i'?ve|i\s+have)\s+shared\b/i.test(t) ||
    /\bshared\s+(any\s+)?(photos?|pictures?|images?)\b/i.test(t) ||
    /\b(photos?|pictures?|images?)\b.*\babout\b/i.test(t) ||
    /\babout\b.*\b(photos?|pictures?|images?)\b/i.test(t) ||
    (/\bhow\s+about\b/i.test(t) &&
      /\b(photo|photos|picture|pictures|image|images)\b/i.test(t))
  );
}

/**
 * Topic-level episodic recall ("anything about Tesla?") — user did not say "photo"
 * but past images may be part of what Pem should surface alongside text memory.
 */
const IMPLICIT_MEDIA_LIST_NOISE =
  /\b(shopping|groceries|my\s+list|to-?do|inbox|tasks?)\b/i;

export function wantsImplicitPastMediaContext(userText: string): boolean {
  const t = userText.trim();
  if (t.length < 12 || t.length > 400) return false;
  if (
    /\b(photo|photos|picture|pictures|image|images|screenshot|pics?)\b/i.test(t)
  ) {
    return false;
  }
  if (
    /\b(something|anything)\s+about\b/i.test(t) &&
    !IMPLICIT_MEDIA_LIST_NOISE.test(t)
  ) {
    return true;
  }
  if (!/\babout\b/i.test(t)) return false;
  return (
    /\b(recall|remember|remind\s+me)\b/i.test(t) ||
    (/\b(do\s+u|do\s+you|does\s+pem|did\s+you|can\s+you)\b/i.test(t) &&
      /\b(recall|remember|know)\b/i.test(t)) ||
    /\b(what|anything)\s+(do\s+u|do\s+you|does\s+pem|did\s+i|have\s+i)\s+(know|remember|recall|say|said)\b/i.test(
      t,
    ) ||
    /\b(i'?ve|i\s+have)\s+(shared|sent|mentioned)\b/i.test(t)
  );
}
