import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { and, eq, isNotNull, ne, sql } from 'drizzle-orm';
import { z } from 'zod';

import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import { messagesTable } from '../../../database/schemas';
import {
  EmbeddingsService,
  type SimilaritySearchOpts,
} from '../../../embeddings/embeddings.service';
import {
  photoRecallIntentSystemPrompt,
  photoRecallIntentUserPrompt,
} from '../../../chat/prompts/chat-photo-recall-intent.prompt';
import {
  PHOTO_RECALL_MAX_MESSAGE_IDS,
  resolvePhotoRecallMessageIdsForQuery,
} from './resolve-photo-recall-message-ids';
import { shouldSkipPhotoRecallStrip } from './photo-recall-strip-guard';

const CANDIDATE_LIMIT = 12;
const VISION_SNIP = 260;
const CAPTION_SNIP = 100;

const photoRecallIntentSchema = z.object({
  attachRelevantPastPhotos: z
    .boolean()
    .describe(
      'True if past chat photos should appear as thumbnails: explicit photo requests OR memory/conversation recall when candidates relate.',
    ),
  embeddingSearchHint: z
    .string()
    .max(240)
    .optional()
    .describe(
      'When true: short phrase for image similarity search (names, places, events). Omit if not needed.',
    ),
  orderedMessageIds: z
    .array(z.string())
    .max(PHOTO_RECALL_MAX_MESSAGE_IDS)
    .optional()
    .describe(
      'When true: candidate message ids in best-first order. Only ids from the list.',
    ),
});

type PhotoRecallIntent = z.infer<typeof photoRecallIntentSchema>;

@Injectable()
export class ChatPhotoRecallIntentService {
  private readonly log = new Logger(ChatPhotoRecallIntentService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
  ) {}

  /**
   * Whether to attach the thumbnail strip, and which image message rows to prefer.
   */
  async resolveStripAndMessageIds(params: {
    userId: string;
    userText: string;
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

    if (shouldSkipPhotoRecallStrip(params.userText)) {
      return { attachStrip: false, messageIds: [] };
    }

    const candidates = await this.loadCandidates(
      params.userId,
      params.excludeMessageId,
    );
    if (!candidates.length) {
      return { attachStrip: false, messageIds: [] };
    }

    const allowed = new Set(candidates.map((c) => c.id));
    let intent: PhotoRecallIntent | null = null;
    try {
      intent = await this.runClassifier(params.userText, candidates);
    } catch (e) {
      this.log.warn(
        `Photo recall intent failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return { attachStrip: false, messageIds: [] };
    }

    if (!intent?.attachRelevantPastPhotos) {
      return { attachStrip: false, messageIds: [] };
    }

    const ordered = (intent.orderedMessageIds ?? []).filter((id) =>
      allowed.has(id),
    );
    if (ordered.length > 0) {
      return {
        attachStrip: true,
        messageIds: ordered.slice(0, PHOTO_RECALL_MAX_MESSAGE_IDS),
      };
    }

    const searchText =
      intent.embeddingSearchHint?.trim() ||
      (params.vectorQueryText ?? params.userText).trim();
    const resolved = await resolvePhotoRecallMessageIdsForQuery(
      this.db,
      this.embeddings,
      params.userId,
      searchText,
      params.ragMessageIds,
      params.vectorSearchOpts,
    );
    return {
      attachStrip: resolved.length > 0,
      messageIds: resolved,
    };
  }

  private async loadCandidates(
    userId: string,
    excludeMessageId?: string,
  ): Promise<{ id: string; caption: string; vision: string }[]> {
    const rows = await this.db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        visionSummary: messagesTable.visionSummary,
        imageKeys: messagesTable.imageKeys,
      })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, userId),
          eq(messagesTable.role, 'user'),
          eq(messagesTable.kind, 'image'),
          isNotNull(messagesTable.visionSummary),
          ...(excludeMessageId ? [ne(messagesTable.id, excludeMessageId)] : []),
        ),
      )
      .orderBy(sql`${messagesTable.createdAt} DESC`)
      .limit(CANDIDATE_LIMIT * 2);

    const withAssets = rows.filter(
      (r) =>
        (r.imageKeys?.length ?? 0) > 0 && (r.visionSummary ?? '').trim().length,
    );

    return withAssets.slice(0, CANDIDATE_LIMIT).map((r) => ({
      id: r.id,
      caption: (r.content ?? '').trim().slice(0, CAPTION_SNIP),
      vision: (r.visionSummary ?? '').trim().slice(0, VISION_SNIP),
    }));
  }

  private async runClassifier(
    userText: string,
    candidates: { id: string; caption: string; vision: string }[],
  ): Promise<PhotoRecallIntent | null> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return null;

    const numbered = candidates
      .map(
        (c, i) =>
          `${i + 1}) ${c.id} — ${c.caption || '(no caption)'} — ${c.vision}`,
      )
      .join('\n');

    const openai = createOpenAI({ apiKey });
    const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    const { output } = await generateText({
      model: openai(modelId),
      output: Output.object({
        name: 'chat_photo_recall_intent',
        description:
          'Whether to attach past chat photo thumbnails (explicit ask or memory recall)',
        schema: photoRecallIntentSchema,
      }),
      temperature: 0,
      system: photoRecallIntentSystemPrompt(),
      prompt: photoRecallIntentUserPrompt(userText, numbered),
      maxRetries: 2,
      providerOptions: { openai: { strictJsonSchema: false } },
    });

    return output ?? null;
  }
}
