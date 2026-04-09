import { Injectable, Inject } from '@nestjs/common';
import { and, desc, eq, lt } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  messagesTable,
  type MessageRow,
  type MessageRole,
  type MessageKind,
  type TriageCategory,
  type ProcessingStatus,
} from '../database/schemas';

@Injectable()
export class ChatService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async saveMessage(params: {
    userId: string;
    role: MessageRole;
    kind: MessageKind;
    content?: string | null;
    voiceUrl?: string | null;
    audioKey?: string | null;
    transcript?: string | null;
    triageCategory?: TriageCategory | null;
    processingStatus?: ProcessingStatus | null;
    parentMessageId?: string | null;
  }): Promise<MessageRow> {
    const [row] = await this.db
      .insert(messagesTable)
      .values({
        userId: params.userId,
        role: params.role,
        kind: params.kind,
        content: params.content ?? null,
        voiceUrl: params.voiceUrl ?? null,
        audioKey: params.audioKey ?? null,
        transcript: params.transcript ?? null,
        triageCategory: params.triageCategory ?? null,
        processingStatus: params.processingStatus ?? null,
        parentMessageId: params.parentMessageId ?? null,
      })
      .returning();
    return row;
  }

  async updateMessage(
    messageId: string,
    patch: Partial<{
      content: string | null;
      transcript: string | null;
      triageCategory: TriageCategory | null;
      processingStatus: ProcessingStatus | null;
      polishedText: string | null;
    }>,
  ): Promise<MessageRow | null> {
    const [row] = await this.db
      .update(messagesTable)
      .set(patch)
      .where(eq(messagesTable.id, messageId))
      .returning();
    return row ?? null;
  }

  async getMessages(
    userId: string,
    opts: { before?: string; limit?: number },
  ): Promise<{ messages: MessageRow[]; has_more: boolean }> {
    const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
    const conditions = [eq(messagesTable.userId, userId)];
    if (opts.before) {
      const beforeDate = new Date(opts.before);
      if (!Number.isNaN(beforeDate.getTime())) {
        conditions.push(lt(messagesTable.createdAt, beforeDate));
      }
    }
    const rows = await this.db
      .select()
      .from(messagesTable)
      .where(and(...conditions))
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { messages: page.reverse(), has_more: hasMore };
  }

  async getRecentMessages(userId: string, limit = 20): Promise<MessageRow[]> {
    const rows = await this.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.userId, userId))
      .orderBy(desc(messagesTable.createdAt))
      .limit(limit);
    return rows.reverse();
  }

  async findMessage(messageId: string): Promise<MessageRow | null> {
    const [row] = await this.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, messageId))
      .limit(1);
    return row ?? null;
  }

  serializeMessage(m: MessageRow) {
    return {
      id: m.id,
      role: m.role,
      kind: m.kind,
      content: m.content,
      voice_url: m.voiceUrl,
      transcript: m.transcript,
      triage_category: m.triageCategory,
      processing_status: m.processingStatus,
      polished_text: m.polishedText,
      metadata: m.metadata ?? null,
      parent_message_id: m.parentMessageId,
      created_at: m.createdAt.toISOString(),
    };
  }
}
