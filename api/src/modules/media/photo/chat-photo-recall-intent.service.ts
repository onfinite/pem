import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, inArray, isNotNull, ne, or, sql } from 'drizzle-orm';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import { messagesTable } from '@/database/schemas/index';
import {
  EmbeddingsService,
  type SimilaritySearchOpts,
} from '@/modules/memory/embeddings.service';
import {
  PHOTO_RECALL_CANDIDATE_LIMIT,
  PHOTO_RECALL_CLASSIFIER_MAX_CANDIDATES,
  PHOTO_RECALL_STRIP_SCORE_GAP,
  PHOTO_RECALL_VECTOR_CANDIDATE_EXTRA,
  RAG_IMAGE_RECALL_MIN_SIMILARITY,
  RAG_IMAGE_RECALL_MIN_SIMILARITY_RELAXED,
  RAG_IMAGE_RECALL_TOP_K,
} from '@/modules/chat/constants/chat.constants';
import { isPhotoRecallEligibleMessage } from '@/modules/media/photo/helpers/photo-recall-eligibility';
import { visionLineForHumans } from '@/modules/media/photo/helpers/photo-vision-stored';
import {
  PHOTO_RECALL_MAX_MESSAGE_IDS,
  dedupeImageRecallHitsByMessage,
  pruneImageRecallHitsByTopScoreGap,
} from '@/modules/media/photo/helpers/resolve-photo-recall-message-ids';
import {
  isExplicitPastPhotoRequest,
  isLikelyPastImageRecallRequest,
  isUndirectedPastPhotosAsk,
  wantsImplicitPastMediaContext,
} from '@/modules/media/photo/helpers/photo-recall-follow-up';
import { shouldSkipPhotoRecallStrip } from '@/modules/media/photo/helpers/photo-recall-strip-guard';
import { logWithContext } from '@/core/utils/format-log-context';
import {
  ChatPhotoRecallIntentLlmService,
  type PhotoRecallIntentOutput,
} from '@/modules/media/photo/chat-photo-recall-intent-llm.service';

const VISION_SNIP = 260;
const CAPTION_SNIP = 100;

@Injectable()
export class ChatPhotoRecallIntentService {
  private readonly log = new Logger(ChatPhotoRecallIntentService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
    private readonly recallIntentLlm: ChatPhotoRecallIntentLlmService,
  ) {}

  /**
   * Whether to attach the thumbnail strip, and which image message rows to prefer.
   */
  async resolveStripAndMessageIds(params: {
    userId: string;
    /** Full message text for RAG / default embedding query (may include vision blocks). */
    userText: string;
    /**
     * What the user actually typed (caption, transcript). Used for the fast strip guard
     * and the recall classifier so link+photo shares are not judged on megabytes of vision text.
     */
    classifierUserText?: string;
    /** Augmented text for vector search only (e.g. ISO time window). Defaults to userText. */
    vectorQueryText?: string;
    ragMessageIds: string[];
    excludeMessageId?: string;
    vectorSearchOpts?: SimilaritySearchOpts;
  }): Promise<{ attachStrip: boolean; messageIds: string[] }> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      return { attachStrip: false, messageIds: [] };
    }

    const stripGuardAndClassifierText = (
      params.classifierUserText?.trim() || params.userText
    ).trim();

    if (shouldSkipPhotoRecallStrip(stripGuardAndClassifierText)) {
      return { attachStrip: false, messageIds: [] };
    }

    const candidates = await this.loadCandidates(
      params.userId,
      params.excludeMessageId,
      stripGuardAndClassifierText,
    );
    if (!candidates.length) {
      return { attachStrip: false, messageIds: [] };
    }

    const allowed = new Set(candidates.map((c) => c.id));
    const classifierCandidates = candidates.slice(
      0,
      PHOTO_RECALL_CLASSIFIER_MAX_CANDIDATES,
    );
    let intent: PhotoRecallIntentOutput | null = null;
    try {
      intent = await this.runClassifier(
        stripGuardAndClassifierText,
        classifierCandidates,
      );
    } catch (e) {
      this.log.warn(
        logWithContext('Photo recall intent failed', {
          userId: params.userId,
          scope: 'photo_recall_intent',
          err: e instanceof Error ? e.message : 'unknown',
        }),
      );
      if (
        !isLikelyPastImageRecallRequest(stripGuardAndClassifierText) &&
        !wantsImplicitPastMediaContext(stripGuardAndClassifierText)
      ) {
        return { attachStrip: false, messageIds: [] };
      }
    }

    const implicitPastMedia = wantsImplicitPastMediaContext(
      stripGuardAndClassifierText,
    );

    const allowStrip =
      intent?.attachRelevantPastPhotos === true ||
      isLikelyPastImageRecallRequest(stripGuardAndClassifierText);

    if (!allowStrip && !implicitPastMedia) {
      return { attachStrip: false, messageIds: [] };
    }

    const ordered = (intent?.orderedMessageIds ?? []).filter((id: string) =>
      allowed.has(id),
    );

    const searchText =
      intent?.attachRelevantPastPhotos === true &&
      intent.embeddingSearchHint?.trim()
        ? intent.embeddingSearchHint.trim()
        : (params.vectorQueryText ?? params.userText).trim();

    let rawImageHits = await this.embeddings.similaritySearchImageMessages(
      params.userId,
      searchText,
      RAG_IMAGE_RECALL_TOP_K,
      RAG_IMAGE_RECALL_MIN_SIMILARITY,
      params.vectorSearchOpts,
    );
    let deduped = dedupeImageRecallHitsByMessage(rawImageHits);
    let vectorPrunedIds = pruneImageRecallHitsByTopScoreGap(
      deduped,
      PHOTO_RECALL_STRIP_SCORE_GAP,
    );
    if (
      vectorPrunedIds.length === 0 &&
      (isLikelyPastImageRecallRequest(stripGuardAndClassifierText) ||
        implicitPastMedia)
    ) {
      rawImageHits = await this.embeddings.similaritySearchImageMessages(
        params.userId,
        searchText,
        RAG_IMAGE_RECALL_TOP_K,
        RAG_IMAGE_RECALL_MIN_SIMILARITY_RELAXED,
        params.vectorSearchOpts,
      );
      deduped = dedupeImageRecallHitsByMessage(rawImageHits);
      vectorPrunedIds = pruneImageRecallHitsByTopScoreGap(
        deduped,
        PHOTO_RECALL_STRIP_SCORE_GAP,
      );
    }

    if (ordered.length > 0) {
      const prunedSet = new Set(vectorPrunedIds);
      const refined = ordered.filter((id: string) => prunedSet.has(id));
      if (refined.length > 0) {
        return {
          attachStrip: true,
          messageIds: refined.slice(0, PHOTO_RECALL_MAX_MESSAGE_IDS),
        };
      }
      const orderedAllowed = ordered.filter((id: string) => allowed.has(id));
      if (orderedAllowed.length > 0) {
        return {
          attachStrip: true,
          messageIds: orderedAllowed.slice(0, PHOTO_RECALL_MAX_MESSAGE_IDS),
        };
      }
    }

    if (vectorPrunedIds.length > 0) {
      return {
        attachStrip: true,
        messageIds: vectorPrunedIds.slice(0, PHOTO_RECALL_MAX_MESSAGE_IDS),
      };
    }

    if (
      candidates.length > 0 &&
      (implicitPastMedia ||
        isUndirectedPastPhotosAsk(stripGuardAndClassifierText))
    ) {
      return {
        attachStrip: true,
        messageIds: candidates
          .slice(0, PHOTO_RECALL_MAX_MESSAGE_IDS)
          .map((c) => c.id),
      };
    }

    if (
      candidates.length > 0 &&
      vectorPrunedIds.length === 0 &&
      isExplicitPastPhotoRequest(stripGuardAndClassifierText) &&
      !isUndirectedPastPhotosAsk(stripGuardAndClassifierText)
    ) {
      return {
        attachStrip: true,
        messageIds: [candidates[0].id],
      };
    }

    return { attachStrip: false, messageIds: [] };
  }

  private async loadCandidates(
    userId: string,
    excludeMessageId: string | undefined,
    vectorHint: string,
  ): Promise<{ id: string; caption: string; vision: string }[]> {
    const rows = await this.db
      .select({
        id: messagesTable.id,
        role: messagesTable.role,
        kind: messagesTable.kind,
        content: messagesTable.content,
        visionSummary: messagesTable.visionSummary,
        imageKeys: messagesTable.imageKeys,
        createdAt: messagesTable.createdAt,
      })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, userId),
          eq(messagesTable.role, 'user'),
          isNotNull(messagesTable.visionSummary),
          sql`btrim(${messagesTable.visionSummary}) <> ''`,
          or(
            and(
              eq(messagesTable.kind, 'image'),
              sql`coalesce(jsonb_array_length(coalesce(${messagesTable.imageKeys}, '[]'::jsonb)), 0) > 0`,
            ),
            and(
              eq(messagesTable.kind, 'voice'),
              sql`coalesce(jsonb_array_length(coalesce(${messagesTable.imageKeys}, '[]'::jsonb)), 0) > 0`,
            ),
          ),
          ...(excludeMessageId ? [ne(messagesTable.id, excludeMessageId)] : []),
        ),
      )
      .orderBy(sql`${messagesTable.createdAt} DESC`)
      .limit(PHOTO_RECALL_CANDIDATE_LIMIT * 2);

    const withAssets = rows.filter((r) =>
      isPhotoRecallEligibleMessage({
        role: r.role,
        kind: r.kind,
        imageKeys: r.imageKeys,
        visionSummary: r.visionSummary,
      }),
    );

    const timeOrdered = withAssets.slice(0, PHOTO_RECALL_CANDIDATE_LIMIT * 2);
    const byId = new Map(timeOrdered.map((r) => [r.id, r]));

    const hint = vectorHint.trim() || 'recent chat photos';
    try {
      const hits = await this.embeddings.similaritySearchImageMessages(
        userId,
        hint,
        PHOTO_RECALL_VECTOR_CANDIDATE_EXTRA + 4,
        RAG_IMAGE_RECALL_MIN_SIMILARITY_RELAXED,
      );
      const extraIds = hits
        .map((h) => h.messageId)
        .filter((id) => id !== excludeMessageId && !byId.has(id))
        .slice(0, PHOTO_RECALL_VECTOR_CANDIDATE_EXTRA);

      if (extraIds.length > 0) {
        const extraRows = await this.db
          .select({
            id: messagesTable.id,
            role: messagesTable.role,
            kind: messagesTable.kind,
            content: messagesTable.content,
            visionSummary: messagesTable.visionSummary,
            imageKeys: messagesTable.imageKeys,
            createdAt: messagesTable.createdAt,
          })
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.userId, userId),
              inArray(messagesTable.id, extraIds),
            ),
          );

        for (const r of extraRows) {
          if (
            isPhotoRecallEligibleMessage({
              role: r.role,
              kind: r.kind,
              imageKeys: r.imageKeys,
              visionSummary: r.visionSummary,
            })
          ) {
            byId.set(r.id, r);
          }
        }
      }
    } catch (e) {
      this.log.warn(
        logWithContext('Photo recall vector candidates failed', {
          userId,
          scope: 'photo_recall_intent',
          err: e instanceof Error ? e.message : 'unknown',
        }),
      );
    }

    const merged = [...byId.values()].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
    );

    return merged.slice(0, PHOTO_RECALL_CANDIDATE_LIMIT).map((r) => ({
      id: r.id,
      caption: (r.content ?? '').trim().slice(0, CAPTION_SNIP),
      vision: visionLineForHumans(r.visionSummary ?? '').slice(0, VISION_SNIP),
    }));
  }

  private async runClassifier(
    userText: string,
    candidates: { id: string; caption: string; vision: string }[],
  ): Promise<PhotoRecallIntentOutput | null> {
    const numbered = candidates
      .map(
        (c, i) =>
          `${i + 1}) ${c.id} — ${c.caption || '(no caption)'} — ${c.vision}`,
      )
      .join('\n');

    return this.recallIntentLlm.classifyIntent({
      userText,
      numberedCandidatesBlock: numbered,
    });
  }
}
