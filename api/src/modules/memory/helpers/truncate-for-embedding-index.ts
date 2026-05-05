import { EMBEDDING_INDEX_TEXT_MAX_CHARS } from '@/modules/chat/constants/chat.constants';

const TRUNC_MARKER = '\n…[truncated]…\n';

/**
 * Deterministic cap for embedding input so long voice + vision rows do not fail embed.
 */
export function truncateForEmbeddingIndex(
  text: string,
  maxChars: number = EMBEDDING_INDEX_TEXT_MAX_CHARS,
): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const budget = maxChars - TRUNC_MARKER.length;
  const half = Math.floor(budget / 2);
  if (half < 200) return t.slice(0, maxChars);
  return `${t.slice(0, half)}${TRUNC_MARKER}${t.slice(-half)}`;
}
