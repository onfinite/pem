import {
  buildRecallEmbeddingAugmentation,
  type QuestionTemporalRange,
} from '@/modules/agent/question/helpers/chat-question-temporal';
import {
  RAG_MIN_SIMILARITY,
  RAG_TOP_K,
} from '@/modules/chat/constants/chat.constants';

export type RagSimilarityHit = {
  messageId: string;
  content: string;
  similarity: number;
};

/** Dedupe by message id; keep the higher similarity score. */
export function mergeRagHitsByMessageId(
  primary: RagSimilarityHit[],
  secondary: RagSimilarityHit[],
): RagSimilarityHit[] {
  const map = new Map<string, RagSimilarityHit>();
  for (const h of primary) {
    map.set(h.messageId, { ...h });
  }
  for (const h of secondary) {
    const prev = map.get(h.messageId);
    if (!prev || h.similarity > prev.similarity) {
      map.set(h.messageId, { ...h });
    }
  }
  return [...map.values()].sort((a, b) => b.similarity - a.similarity);
}
/** Looser floor so older phrasing (e.g. "headset idea") still matches "AR/VR". */
export const RAG_MIN_SIMILARITY_BROAD_TOPIC_RECALL = 0.58;

export const RAG_TOP_K_BROAD_TOPIC_RECALL = 24;

/** Second pass when broad recall still returns nothing at 0.58. */
export const RAG_MIN_SIMILARITY_BROAD_TOPIC_RECALL_FALLBACK = 0.52;

/**
 * User is asking for *anything* they've said about a topic across chat history
 * (not a single-day calendar recall). These need lower similarity + optional aliases.
 */
export function isBroadTopicRecallQuery(q: string): boolean {
  const t = q.trim();
  if (t.length < 10) return false;
  return (
    /\b(anything|everything)\s+(i'?ve|i\s+have)\s+talked\s+about\b/i.test(t) ||
    /\bwhat\s+(did\s+i|have\s+i)\s+(say|said|mention|mentioned|talk|talked)\b/i.test(
      t,
    ) ||
    (/\bbring\s+me\b/i.test(t) &&
      /\b(talked|said|mentioned)\b/i.test(t) &&
      /\babout\b/i.test(t)) ||
    /\b(have\s+we|did\s+we)\s+(ever\s+)?(talk|discuss|talked|discussed)\b/i.test(
      t,
    ) ||
    (/\b(show|tell)\s+me\b/i.test(t) &&
      /\b(about|regarding)\b/i.test(t) &&
      /\b(ever|before|previously|talked|discussed)\b/i.test(t)) ||
    (/\b(pull|get)\s+up\b/i.test(t) &&
      /\b(all|everything)\b/i.test(t) &&
      /\bknow\b/i.test(t) &&
      /\babout\b/i.test(t)) ||
    /\b(all|everything)\s+(you\s+|u\s+)?(know|knew)\s+about\b/i.test(t) ||
    /\bwhat\s+(do\s+you|does\s+pem)\s+know\s+about\b/i.test(t) ||
    (/\b(photo|photos|pictures?|images?)\b/i.test(t) &&
      /\b(i'?ve|i\s+have)\s+shared\b/i.test(t)) ||
    (/\bhow\s+about\b/i.test(t) &&
      /\b(photo|photos|picture|pictures|image|images)\b/i.test(t))
  );
}

const LOOSE_RECALL_LIST_NOISE =
  /\b(shopping|groceries|my\s+list|to-?do|inbox|tasks?)\b/i;

/**
 * Episodic memory questions ("remember anything about kid card?", "Something about bowling?")
 * that need broad-style vector floors — not only the long explicit broad-topic patterns.
 */
export function isLooseRecallQuery(q: string): boolean {
  if (isBroadTopicRecallQuery(q)) return true;
  const t = q.trim();
  if (t.length < 10 || t.length > 360) return false;
  if (
    /\b(remember|recall)\b/i.test(t) &&
    (/\babout\b/i.test(t) ||
      /\b(i'?ve|i\s+have)\s+(shared|sent|mentioned)\b/i.test(t) ||
      /\banything\b/i.test(t))
  ) {
    return true;
  }
  if (
    /\b(something|anything)\s+about\b/i.test(t) &&
    !LOOSE_RECALL_LIST_NOISE.test(t)
  ) {
    return true;
  }
  if (/\bremind\s+me\b/i.test(t) && /\babout\b/i.test(t)) return true;
  return false;
}

function topicAliasExpansion(q: string): string {
  const hints: string[] = [];
  if (
    /\b(ar\s*\/\s*vr|ar\/vr|ar\s+vr)\b/i.test(q) ||
    (/\bar\b/i.test(q) && /\bvr\b/i.test(q))
  ) {
    hints.push(
      'augmented reality',
      'virtual reality',
      'mixed reality',
      'spatial computing',
      'headset',
      'immersive',
    );
  }
  if (/\bxr\b/i.test(q)) {
    hints.push('extended reality', 'AR', 'VR');
  }
  if (hints.length === 0) return '';
  return `\nRelated terms for search: ${[...new Set(hints)].join(', ')}.`;
}

export function buildAgentRagSearchParams(
  messageContent: string,
  temporalRange: QuestionTemporalRange | null | undefined,
): {
  vectorQuery: string;
  minSimilarity: number;
  topK: number;
} {
  const base = temporalRange
    ? `${messageContent}\n\n${buildRecallEmbeddingAugmentation(temporalRange)}`
    : messageContent;
  const vectorQuery = `${base}${topicAliasExpansion(messageContent)}`;

  if (!isLooseRecallQuery(messageContent)) {
    return {
      vectorQuery,
      minSimilarity: RAG_MIN_SIMILARITY,
      topK: RAG_TOP_K,
    };
  }

  return {
    vectorQuery,
    minSimilarity: RAG_MIN_SIMILARITY_BROAD_TOPIC_RECALL,
    topK: RAG_TOP_K_BROAD_TOPIC_RECALL,
  };
}
