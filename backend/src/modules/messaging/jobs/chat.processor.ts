import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import { and, asc, eq, gte, inArray, ne } from 'drizzle-orm';
import type { Job } from 'bullmq';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import { messagesTable } from '@/database/schemas/index';
import { BATCH_WINDOW_MS } from '@/modules/chat/constants/chat.constants';
import { ChatOrchestratorService } from '@/modules/messaging/chat-orchestrator.service';
import { logWithContext } from '@/core/utils/format-log-context';

@Processor('chat')
export class ChatProcessor extends WorkerHost {
  private readonly log = new Logger(ChatProcessor.name);

  constructor(
    private readonly orchestrator: ChatOrchestratorService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {
    super();
  }

  async process(
    job: Job<{ messageId: string; userId: string }>,
  ): Promise<void> {
    const { messageId, userId } = job.data;
    if (!messageId || !userId) {
      this.log.warn(
        logWithContext('chat job missing messageId or userId', {
          jobId: job.id,
          messageId: job.data?.messageId,
          userId: job.data?.userId,
        }),
      );
      return;
    }

    const attempts = job.opts?.attempts ?? 3;
    const attempt = job.attemptsMade + 1;
    const isFinalAttempt = job.attemptsMade >= attempts - 1;
    const t0 = Date.now();

    this.log.log(
      logWithContext('chat job start', {
        messageId,
        userId,
        attempt: `${attempt}/${attempts}`,
        jobId: job.id,
      }),
    );

    try {
      await this.mergeRapidMessages(messageId, userId);

      await this.orchestrator.processMessage(messageId, userId, {
        isFinalAttempt,
      });
      this.log.log(
        logWithContext('chat job ok', {
          messageId,
          userId,
          durationMs: Date.now() - t0,
          jobId: job.id,
        }),
      );
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      this.log.warn(
        logWithContext('chat job error', {
          messageId,
          userId,
          attempt: `${attempt}/${attempts}`,
          durationMs: Date.now() - t0,
          err,
          jobId: job.id,
        }),
      );
      throw e;
    }
  }

  /**
   * If additional pending messages from the same user were created within the
   * batch window, merge their content into this message so the orchestrator
   * processes them as a single unit. Merged messages are marked `done` so their
   * own jobs become no-ops.
   */
  private async mergeRapidMessages(
    messageId: string,
    userId: string,
  ): Promise<void> {
    const windowStart = new Date(Date.now() - BATCH_WINDOW_MS);

    const peers = await this.db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        transcript: messagesTable.transcript,
      })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, userId),
          eq(messagesTable.role, 'user'),
          eq(messagesTable.processingStatus, 'pending'),
          ne(messagesTable.id, messageId),
          gte(messagesTable.createdAt, windowStart),
        ),
      )
      .orderBy(asc(messagesTable.createdAt));

    if (peers.length === 0) return;

    const [primary] = await this.db
      .select({
        content: messagesTable.content,
        transcript: messagesTable.transcript,
      })
      .from(messagesTable)
      .where(eq(messagesTable.id, messageId))
      .limit(1);

    if (!primary) return;

    const parts = [
      primary.transcript ?? primary.content ?? '',
      ...peers.map((m) => m.transcript ?? m.content ?? ''),
    ].filter(Boolean);

    const merged = parts.join('\n');

    await this.db
      .update(messagesTable)
      .set({ content: merged })
      .where(eq(messagesTable.id, messageId));

    const peerIds = peers.map((m) => m.id);
    await this.db
      .update(messagesTable)
      .set({ processingStatus: 'done' })
      .where(inArray(messagesTable.id, peerIds));

    this.log.log(
      logWithContext('Batched rapid user messages into primary', {
        messageId,
        userId,
        peerCount: peers.length,
      }),
    );
  }
}
