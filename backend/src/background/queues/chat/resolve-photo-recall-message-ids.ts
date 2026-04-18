import { and, eq, inArray, isNotNull } from 'drizzle-orm';

import type { DrizzleDb } from '../../../database/database.module';
import { messagesTable } from '../../../database/schemas';
import type {
  EmbeddingsService,
  SimilaritySearchOpts,
} from '../../../embeddings/embeddings.service';
import {
  RAG_IMAGE_RECALL_MIN_SIMILARITY,
  RAG_IMAGE_RECALL_TOP_K,
} from '../../../chat/chat.constants';

export const PHOTO_RECALL_MAX_MESSAGE_IDS = 10;

/**
 * Message ids for `photo_recall` thumbnails: image-only vector search on the
 * user's question first, then RAG hits that are image rows.
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
  const fromImages = [...new Set(imageHits.map((h) => h.messageId))];
  if (fromImages.length > 0) {
    return fromImages.slice(0, PHOTO_RECALL_MAX_MESSAGE_IDS);
  }

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
