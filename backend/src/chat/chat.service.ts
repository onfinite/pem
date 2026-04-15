import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, isNotNull, lt, or } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  extractsTable,
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
    idempotencyKey?: string | null;
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
        idempotencyKey: params.idempotencyKey?.trim() || null,
      })
      .returning();
    return row;
  }

  async findMessageByIdempotencyKey(
    userId: string,
    key: string,
  ): Promise<MessageRow | null> {
    const k = key.trim();
    if (!k) return null;
    const [row] = await this.db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, userId),
          isNotNull(messagesTable.idempotencyKey),
          eq(messagesTable.idempotencyKey, k),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async updateMessage(
    messageId: string,
    patch: Partial<{
      content: string | null;
      transcript: string | null;
      triageCategory: TriageCategory | null;
      processingStatus: ProcessingStatus | null;
      polishedText: string | null;
      summary: string | null;
    }>,
    userId?: string,
  ): Promise<MessageRow | null> {
    const conditions = [eq(messagesTable.id, messageId)];
    if (userId) conditions.push(eq(messagesTable.userId, userId));
    const [row] = await this.db
      .update(messagesTable)
      .set(patch)
      .where(and(...conditions))
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

  async findMessage(
    messageId: string,
    userId?: string,
  ): Promise<MessageRow | null> {
    const conditions = [eq(messagesTable.id, messageId)];
    if (userId) conditions.push(eq(messagesTable.userId, userId));
    const [row] = await this.db
      .select()
      .from(messagesTable)
      .where(and(...conditions))
      .limit(1);
    return row ?? null;
  }

  async deleteMessage(userId: string, messageId: string): Promise<void> {
    const [row] = await this.db
      .delete(messagesTable)
      .where(
        and(eq(messagesTable.id, messageId), eq(messagesTable.userId, userId)),
      )
      .returning({ id: messagesTable.id });
    if (!row) throw new NotFoundException('Message not found');
  }

  async searchMessages(
    userId: string,
    query: string,
    limit: number,
  ): Promise<MessageRow[]> {
    if (!query.trim()) return [];
    const pattern = `%${query.replace(/%/g, '\\%')}%`;
    return this.db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, userId),
          or(
            ilike(messagesTable.content, pattern),
            ilike(messagesTable.transcript, pattern),
          ),
        ),
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(Math.min(limit, 50));
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
      summary: m.summary ?? null,
      metadata: m.metadata ?? null,
      parent_message_id: m.parentMessageId,
      idempotency_key: m.idempotencyKey ?? null,
      created_at: m.createdAt.toISOString(),
    };
  }

  async getMessageExtracts(userId: string, messageId: string) {
    return this.db
      .select({
        id: extractsTable.id,
        text: extractsTable.extractText,
        status: extractsTable.status,
        tone: extractsTable.tone,
        batchKey: extractsTable.batchKey,
        listId: extractsTable.listId,
      })
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.messageId, messageId),
        ),
      );
  }

}
