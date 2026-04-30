import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import type { DrizzleDb } from '@/database/database.module';
import { messagesTable } from '@/database/schemas/index';
import type {
  EmbeddingsService,
  SimilaritySearchOpts,
} from '@/modules/chat/services/embeddings.service';
import {
  PHOTO_RECALL_MAX_MESSAGE_IDS,
  PHOTO_RECALL_STRIP_SCORE_GAP,
  RAG_IMAGE_RECALL_MIN_SIMILARITY,
  RAG_IMAGE_RECALL_TOP_K,
} from '@/modules/chat/constants/chat.constants';

export { PHOTO_RECALL_MAX_MESSAGE_IDS };

export type ImageRecallSimilarityHit = {
  messageId: string;
  similarity: number;
};

/** Stable order of message ids as they appear in the capped photo strip. */
export function orderedMessageIdsFromRecallItems(
  items: { message_id: string }[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const it of items) {
    if (seen.has(it.message_id)) continue;
    seen.add(it.message_id);
    out.push(it.message_id);
  }
  return out;
}

/**
 * One row per message id, highest similarity kept (multi-embedding edge cases).
 */
export function dedupeImageRecallHitsByMessage(
  hits: { messageId: string; similarity: number }[],
): ImageRecallSimilarityHit[] {
  const best = new Map<string, number>();
  for (const h of hits) {
    const prev = best.get(h.messageId);
    if (prev === undefined || h.similarity > prev) {
      best.set(h.messageId, h.similarity);
    }
  }
  return [...best.entries()]
    .map(([messageId, similarity]) => ({ messageId, similarity }))
    .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Keep the best hit(s) whose score stays within `gap` of the top score; stops
 * trailing “sort of related” screenshots from appearing beside a clear winner.
 */
export function pruneImageRecallHitsByTopScoreGap(
  hits: ImageRecallSimilarityHit[],
  gap: number,
): string[] {
  if (hits.length === 0) return [];
  const top = hits[0].similarity;
  const out: string[] = [];
  for (const h of hits) {
    if (h.similarity < top - gap) break;
    out.push(h.messageId);
    if (out.length >= PHOTO_RECALL_MAX_MESSAGE_IDS) break;
  }
  return out;
}

/**
 * Image rows among RAG text hits (no per-row similarity — order only).
 */
export async function resolvePhotoRecallMessageIdsFromRagOnly(
  db: DrizzleDb,
  userId: string,
  ragMessageIds: string[],
): Promise<string[]> {
  if (!ragMessageIds.length) return [];

  const rows = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.userId, userId),
        eq(messagesTable.kind, 'image'),
        isNotNull(messagesTable.visionSummary),
        inArray(messagesTable.id, ragMessageIds),
      ),
    )
    .limit(PHOTO_RECALL_MAX_MESSAGE_IDS);

  return rows.map((r) => r.id);
}

/**
 * Message ids for `photo_recall` thumbnails: image-only vector search on the
 * user's question first (with score-gap pruning), then RAG hits that are image rows.
 */
export async function resolvePhotoRecallMessageIdsForQuery(
  db: DrizzleDb,
  embeddings: EmbeddingsService,
  userId: string,
  query: string,
  ragMessageIds: string[],
  vectorSearchOpts?: SimilaritySearchOpts,
): Promise<string[]> {
  const imageHits = await embeddings.similaritySearchImageMessages(
    userId,
    query,
    RAG_IMAGE_RECALL_TOP_K,
    RAG_IMAGE_RECALL_MIN_SIMILARITY,
    vectorSearchOpts,
  );
  const deduped = dedupeImageRecallHitsByMessage(imageHits);
  const fromImages = pruneImageRecallHitsByTopScoreGap(
    deduped,
    PHOTO_RECALL_STRIP_SCORE_GAP,
  );
  if (fromImages.length > 0) {
    return fromImages;
  }

  return resolvePhotoRecallMessageIdsFromRagOnly(db, userId, ragMessageIds);
}
