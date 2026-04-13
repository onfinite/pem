import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { embed } from 'ai';
import { eq, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { messageEmbeddingsTable } from '../database/schemas';
import { RAG_MIN_SIMILARITY, RAG_TOP_K } from '../chat/chat.constants';

@Injectable()
export class EmbeddingsService {
  private readonly log = new Logger(EmbeddingsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
  ) {}

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
      this.log.warn('No OpenAI key — skipping embedding');
      return;
    }

    const embeddingText = `[${createdAt.toISOString()}] ${role}: ${trimmed}`;
    const openai = createOpenAI({ apiKey });

    try {
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: embeddingText,
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
        `Embedding failed for message ${messageId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  async similaritySearch(
    userId: string,
    query: string,
    limit = RAG_TOP_K,
    minSimilarity = RAG_MIN_SIMILARITY,
  ): Promise<{ messageId: string; content: string; similarity: number }[]> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return [];

    const openai = createOpenAI({ apiKey });
    const { embedding } = await embed({
      model: openai.embedding('text-embedding-3-small'),
      value: query,
    });

    const vectorStr = `[${embedding.join(',')}]`;

    const results = await this.db.execute(sql`
      SELECT
        me.message_id,
        me.content,
        1 - (me.embedding <=> ${vectorStr}::vector) as cosine_sim,
        me.created_at,
        (1 - (me.embedding <=> ${vectorStr}::vector))
          + LEAST(0.05, 0.05 * (1.0 - EXTRACT(EPOCH FROM (NOW() - me.created_at)) / (30.0 * 86400)))
          as boosted_sim
      FROM message_embeddings me
      WHERE me.user_id = ${userId}
        AND (1 - (me.embedding <=> ${vectorStr}::vector)) >= ${minSimilarity}
      ORDER BY boosted_sim DESC
      LIMIT ${limit}
    `);

    return (
      results.rows as {
        message_id: string;
        content: string;
        cosine_sim: string;
        boosted_sim: string;
      }[]
    ).map((r) => ({
      messageId: r.message_id,
      content: r.content,
      similarity: Number(r.boosted_sim),
    }));
  }
}
