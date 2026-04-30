import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { embed } from 'ai';
import { eq, sql } from 'drizzle-orm';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import { messageEmbeddingsTable } from '@/database/schemas/index';
import { logWithContext } from '@/core/utils/format-log-context';
import {
  RAG_IMAGE_RECALL_MIN_SIMILARITY,
  RAG_IMAGE_RECALL_TOP_K,
  RAG_MIN_SIMILARITY,
  RAG_TEMPORAL_PREFETCH_CAP,
  RAG_TEMPORAL_WINDOW_BOOST,
  RAG_TOP_K,
} from '@/modules/chat/constants/chat.constants';

export type SimilaritySearchOpts = {
  temporalBoost?: { start: Date; end: Date };
};

type SimilarityRow = {
  messageId: string;
  content: string;
  similarity: number;
  messageCreatedAt: Date;
};

@Injectable()
export class EmbeddingsService {
  private readonly log = new Logger(EmbeddingsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
  ) {}

  private async embedTextWithOpenAI(params: {
    apiKey: string;
    text: string;
  }): Promise<number[]> {
    const openai = createOpenAI({ apiKey: params.apiKey });
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: params.text,
    });
    return embedding;
  }

  private isMessageInTemporalWindow(
    createdAt: Date,
    window: { start: Date; end: Date },
  ): boolean {
    const t = createdAt.getTime();
    return t >= window.start.getTime() && t <= window.end.getTime();
  }

  private applyTemporalRerank(
    rows: SimilarityRow[],
    limit: number,
    window: { start: Date; end: Date } | undefined,
  ): { messageId: string; content: string; similarity: number }[] {
    if (!window || rows.length === 0) {
      return rows.slice(0, limit).map(({ messageId, content, similarity }) => ({
        messageId,
        content,
        similarity,
      }));
    }
    const adjusted = rows.map((r) => ({
      messageId: r.messageId,
      content: r.content,
      similarity:
        r.similarity +
        (this.isMessageInTemporalWindow(r.messageCreatedAt, window)
          ? RAG_TEMPORAL_WINDOW_BOOST
          : 0),
    }));
    adjusted.sort((a, b) => b.similarity - a.similarity);
    return adjusted.slice(0, limit);
  }

  /**
   * Embed a chat line after the message is persisted. Idempotent per message_id.
   * Prefix role so RAG snippets stay interpretable (user vs Pem).
   */
  async embedChatMessageIfAbsent(params: {
    messageId: string;
    userId: string;
    role: 'user' | 'pem';
    text: string;
    createdAt: Date;
  }): Promise<void> {
    const { messageId, userId, role, text, createdAt } = params;
    const trimmed = text?.trim() ?? '';
    if (!trimmed) return;

    const [existing] = await this.db
      .select({ id: messageEmbeddingsTable.id })
      .from(messageEmbeddingsTable)
      .where(eq(messageEmbeddingsTable.messageId, messageId))
      .limit(1);
    if (existing) return;

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn(
        logWithContext('No OpenAI key — skipping embedding', {
          messageId,
          userId,
          role,
          scope: 'embedding',
        }),
      );
      return;
    }

    const embeddingText = `[${createdAt.toISOString()}] ${role}: ${trimmed}`;

    try {
      const embedding = await this.embedTextWithOpenAI({
        apiKey,
        text: embeddingText,
      });

      await this.db
        .insert(messageEmbeddingsTable)
        .values({
          messageId,
          userId,
          content: embeddingText,
          embedding,
        })
        .onConflictDoNothing({
          target: messageEmbeddingsTable.messageId,
        });
    } catch (e) {
      this.log.error(
        logWithContext('Embedding failed', {
          messageId,
          userId,
          err: e instanceof Error ? e.message : String(e),
          scope: 'embedding',
        }),
      );
    }
  }

  async similaritySearch(
    userId: string,
    query: string,
    limit = RAG_TOP_K,
    minSimilarity = RAG_MIN_SIMILARITY,
    opts?: SimilaritySearchOpts,
  ): Promise<{ messageId: string; content: string; similarity: number }[]> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return [];

    const embedding = await this.embedTextWithOpenAI({ apiKey, text: query });

    const vectorStr = `[${embedding.join(',')}]`;
    const fetchCap = opts?.temporalBoost
      ? Math.min(RAG_TEMPORAL_PREFETCH_CAP, Math.max(limit * 3, limit))
      : limit;

    const results = await this.db.execute(sql`
      SELECT
        me.message_id,
        me.content,
        1 - (me.embedding <=> ${vectorStr}::vector) as cosine_sim,
        me.created_at,
        m.created_at as msg_created_at,
        (1 - (me.embedding <=> ${vectorStr}::vector))
          + LEAST(0.05, 0.05 * (1.0 - EXTRACT(EPOCH FROM (NOW() - me.created_at)) / (30.0 * 86400)))
          as boosted_sim
      FROM message_embeddings me
      INNER JOIN messages m ON m.id = me.message_id AND m.user_id = me.user_id
      WHERE me.user_id = ${userId}
        AND (1 - (me.embedding <=> ${vectorStr}::vector)) >= ${minSimilarity}
      ORDER BY boosted_sim DESC
      LIMIT ${fetchCap}
    `);

    const rows: SimilarityRow[] = (
      results.rows as {
        message_id: string;
        content: string;
        cosine_sim: string;
        boosted_sim: string;
        msg_created_at: string | Date;
      }[]
    ).map((r) => ({
      messageId: r.message_id,
      content: r.content,
      similarity: Number(r.boosted_sim),
      messageCreatedAt:
        r.msg_created_at instanceof Date
          ? r.msg_created_at
          : new Date(r.msg_created_at),
    }));

    return this.applyTemporalRerank(rows, limit, opts?.temporalBoost);
  }

  /**
   * Vector search restricted to **user image messages** so "LA trip photos"
   * ranks relevant shots instead of every recent image.
   */
  async similaritySearchImageMessages(
    userId: string,
    query: string,
    limit = RAG_IMAGE_RECALL_TOP_K,
    minSimilarity = RAG_IMAGE_RECALL_MIN_SIMILARITY,
    opts?: SimilaritySearchOpts,
  ): Promise<{ messageId: string; content: string; similarity: number }[]> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return [];

    const embedding = await this.embedTextWithOpenAI({ apiKey, text: query });

    const vectorStr = `[${embedding.join(',')}]`;
    const fetchCap = opts?.temporalBoost
      ? Math.min(RAG_TEMPORAL_PREFETCH_CAP, Math.max(limit * 3, limit))
      : limit;

    const results = await this.db.execute(sql`
      SELECT
        me.message_id,
        me.content,
        1 - (me.embedding <=> ${vectorStr}::vector) as cosine_sim,
        me.created_at,
        m.created_at as msg_created_at,
        (1 - (me.embedding <=> ${vectorStr}::vector))
          + LEAST(0.05, 0.05 * (1.0 - EXTRACT(EPOCH FROM (NOW() - me.created_at)) / (30.0 * 86400)))
          as boosted_sim
      FROM message_embeddings me
      INNER JOIN messages m ON m.id = me.message_id AND m.user_id = me.user_id
      WHERE me.user_id = ${userId}
        AND m.kind = 'image'
        AND (1 - (me.embedding <=> ${vectorStr}::vector)) >= ${minSimilarity}
      ORDER BY boosted_sim DESC
      LIMIT ${fetchCap}
    `);

    const rows: SimilarityRow[] = (
      results.rows as {
        message_id: string;
        content: string;
        cosine_sim: string;
        boosted_sim: string;
        msg_created_at: string | Date;
      }[]
    ).map((r) => ({
      messageId: r.message_id,
      content: r.content,
      similarity: Number(r.boosted_sim),
      messageCreatedAt:
        r.msg_created_at instanceof Date
          ? r.msg_created_at
          : new Date(r.msg_created_at),
    }));

    return this.applyTemporalRerank(rows, limit, opts?.temporalBoost);
  }
}
