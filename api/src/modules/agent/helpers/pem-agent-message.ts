import type { PemExtractionOutput } from '@/modules/agent/schemas/pem-agent-output.schema';

export function extractionIsEmpty(e: PemExtractionOutput): boolean {
  return (
    e.creates.length === 0 &&
    e.updates.length === 0 &&
    e.completions.length === 0
  );
}

const MAX_MESSAGE_CHARS = 4000;

export function truncateForPrompt(content: string): string {
  if (content.length <= MAX_MESSAGE_CHARS) return content;
  return (
    content.slice(0, MAX_MESSAGE_CHARS) + '\n\n(message truncated for length)'
  );
}

/** Programmatic gate (Anthropic): re-check when model returns no work but text looks actionable. */
export function messageLikelyContainsTasks(content: string): boolean {
  const t = content.trim();
  if (t.length < 10) return false;
  if (/User photo caption:/i.test(t)) {
    if (
      /\b(should|need to|have to|must|got to|gotta|todo|to-?do|tasks?|remind|my list|things i|stuff i|on my plate|appointments?|schedule)\b/i.test(
        t,
      )
    ) {
      return true;
    }
  }
  if (t.length > 60) return true;
  return /\b(need|must|have to|should|don't forget|dont forget|remind|pick up|pickup|grab|buy|call|email|text|schedule|tomorrow|tonight|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|errands|groceries|shopping|appointment|meeting|deadline|worried|concern|miss|missing|afraid|scared|prioritize|important|urgent|focus|stuff to do|things to do)\b/i.test(
    t,
  );
}

/** Follow-up after image_reference_only Pem reply: explicit plan / short yes + prior user photo in thread. */
export function shortAffirmationToPlanRecentPhoto(params: {
  messageContent: string;
  recentMessages: { role: string; content: string; created_at: string }[];
}): boolean {
  const t = params.messageContent.trim();
  if (t.length > 60) return false;
  const hasPriorUserPhoto = params.recentMessages.some(
    (m) => m.role === 'user' && /\[Photo:/i.test(m.content),
  );
  if (!hasPriorUserPhoto) return false;

  if (/\b(plan it|add tasks?|turn it into tasks?)\b/i.test(t)) return true;
  if (/\b(yes|sure|ok|okay|yeah).{0,18}\bplan\b/i.test(t)) return true;
  if (
    t.length <= 22 &&
    /^(y(es)?|sure|ok(ay)?|go ahead|do it)\s*!*$/i.test(t)
  ) {
    return true;
  }
  return false;
}
