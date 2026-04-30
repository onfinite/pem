import { Injectable, Inject, NotFoundException } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  lt,
  or,
} from 'drizzle-orm';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  extractsTable,
  messageLinksTable,
  messagesTable,
  type MessageImageAsset,
  type MessageRow,
  type MessageRole,
  type MessageKind,
  type TriageCategory,
  type ProcessingStatus,
} from '@/database/schemas/index';
import type { ChatLinkPreviewSerialized } from '@/modules/chat/types/link-preview.types';
import { resolveLinkPreviewImageUrl } from '@/modules/chat/helpers/chat-link-client-preview.helpers';
import { decodePhotoVisionStored } from '@/modules/chat/helpers/photo-vision-stored';

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
    imageKeys?: MessageImageAsset[] | null;
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
        imageKeys: params.imageKeys ?? null,
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
      visionSummary: string | null;
      visionModel: string | null;
      visionCompletedAt: Date | null;
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

  /** Link rows the user saved on chat messages (for client chips / recall). */
  async getLinkPreviewsByMessageIds(
    userId: string,
    messageIds: string[],
  ): Promise<Map<string, ChatLinkPreviewSerialized[]>> {
    const map = new Map<string, ChatLinkPreviewSerialized[]>();
    if (!messageIds.length) return map;

    const rows = await this.db
      .select()
      .from(messageLinksTable)
      .where(
        and(
          eq(messageLinksTable.userId, userId),
          inArray(messageLinksTable.messageId, messageIds),
        ),
      )
      .orderBy(asc(messageLinksTable.createdAt));

    for (const r of rows) {
      const list = map.get(r.messageId) ?? [];
      list.push({
        original_url: r.originalUrl,
        canonical_url: r.canonicalUrl,
        title: r.pageTitle,
        content_type: r.contentType,
        fetch_status: r.fetchStatus,
        summary: r.structuredSummary?.trim()
          ? r.structuredSummary.length > 400
            ? `${r.structuredSummary.slice(0, 400)}…`
            : r.structuredSummary
          : null,
        image_url: resolveLinkPreviewImageUrl(r.extractedMetadata),
      });
      map.set(r.messageId, list);
    }
    return map;
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
            ilike(messagesTable.visionSummary, pattern),
          ),
        ),
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(Math.min(limit, 50));
  }

  serializeMessage(m: MessageRow) {
    const { focus, detail } = decodePhotoVisionStored(m.visionSummary ?? '');
    const visionForClient = focus ?? m.visionSummary ?? null;
    const visionDetailForClient = focus && detail.length > 0 ? detail : null;
    return {
      id: m.id,
      role: m.role,
      kind: m.kind,
      content: m.content,
      voice_url: m.voiceUrl,
      transcript: m.transcript,
      image_keys: m.imageKeys ?? null,
      image_urls: null as { key: string; url: string }[] | null,
      vision_summary: visionForClient,
      vision_summary_detail: visionDetailForClient,
      triage_category: m.triageCategory,
      processing_status: m.processingStatus,
      polished_text: m.polishedText,
      summary: m.summary ?? null,
      metadata: m.metadata ?? null,
      parent_message_id: m.parentMessageId,
      idempotency_key: m.idempotencyKey ?? null,
      created_at: m.createdAt.toISOString(),
      link_previews: null as ChatLinkPreviewSerialized[] | null,
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
