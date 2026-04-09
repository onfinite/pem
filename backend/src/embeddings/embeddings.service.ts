import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { embed } from 'ai';
import { sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { messageEmbeddingsTable } from '../database/schemas';

@Injectable()
export class EmbeddingsService {
  private readonly log = new Logger(EmbeddingsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
  ) {}

  async embedMessage(
    messageId: string,
    userId: string,
    content: string,
    createdAt: Date,
  ): Promise<void> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn('No OpenAI key — skipping embedding');
      return;
    }

    const embeddingText = `[${createdAt.toISOString()}] ${content}`;
    const openai = createOpenAI({ apiKey });

    try {
      const { embedding } = await embed({
        model: openai.embedding('text-embedding-3-small'),
        value: embeddingText,
      });

      await this.db.insert(messageEmbeddingsTable).values({
        messageId,
        userId,
        content: embeddingText,
        embedding,
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
    limit = 10,
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
        1 - (me.embedding <=> ${vectorStr}::vector) as similarity
      FROM message_embeddings me
      WHERE me.user_id = ${userId}
      ORDER BY me.embedding <=> ${vectorStr}::vector
      LIMIT ${limit}
    `);

    return (
      results.rows as {
        message_id: string;
        content: string;
        similarity: string;
      }[]
    ).map((r) => ({
      messageId: r.message_id,
      content: r.content,
      similarity: Number(r.similarity),
    }));
  }
}
