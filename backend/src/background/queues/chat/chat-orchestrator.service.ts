import { Injectable, Logger, Inject } from '@nestjs/common';
import { and, eq, ne, sql } from 'drizzle-orm';

import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import {
  messagesTable,
  extractsTable,
  logsTable,
  usersTable,
  type ExtractRow,
} from '../../../database/schemas';
import { TriageService } from '../../../agents/triage.service';
import {
  PemAgentService,
  type PemAgentOutput,
  type ExtractAction,
} from '../../../agents/pem-agent.service';
import { ChatEventsService } from '../../chat-events/chat-events.service';
import { EmbeddingsService } from '../../../embeddings/embeddings.service';
import { ExtractsService } from '../../../extracts/extracts.service';
import { ProfileService } from '../../../profile/profile.service';
import { CalendarSyncService } from '../../../calendar/calendar-sync.service';
import { PushService } from '../../../push/push.service';
import { TranscriptionService } from '../../../transcription/transcription.service';
import { ChatQuestionService } from './chat-question.service';

function parseIsoDate(s: string | null | undefined): Date | null {
  if (!s || !String(s).trim()) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

@Injectable()
export class ChatOrchestratorService {
  private readonly log = new Logger(ChatOrchestratorService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly triage: TriageService,
    private readonly pemAgent: PemAgentService,
    private readonly chatEvents: ChatEventsService,
    private readonly embeddings: EmbeddingsService,
    private readonly extracts: ExtractsService,
    private readonly profile: ProfileService,
    private readonly calendarSync: CalendarSyncService,
    private readonly push: PushService,
    private readonly transcription: TranscriptionService,
    private readonly questionService: ChatQuestionService,
  ) {}

  async processMessage(
    messageId: string,
    userId: string,
    opts?: { isFinalAttempt?: boolean },
  ): Promise<void> {
    const [msg] = await this.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.id, messageId))
      .limit(1);
    if (!msg) {
      this.log.warn(`Message ${messageId} not found`);
      return;
    }

    try {
      await this.db
        .update(messagesTable)
        .set({ processingStatus: 'processing' })
        .where(eq(messagesTable.id, messageId));

      await this.publishStatus(userId, messageId, 'Processing...');

      let content = msg.content ?? '';

      if (msg.kind === 'voice' && !msg.transcript && msg.voiceUrl) {
        await this.publishStatus(userId, messageId, 'Transcribing voice...');
        // Voice transcription happens before this point in the controller/upload flow
        // If transcript is already set, use it. Otherwise content stays empty.
        content = msg.transcript ?? '';
      }

      if (msg.transcript) {
        content = msg.transcript;
      }

      if (!content.trim()) {
        await this.savePemResponse(
          userId,
          messageId,
          "I couldn't understand that. Could you try again?",
        );
        return;
      }

      // Triage
      await this.publishStatus(
        userId,
        messageId,
        'Understanding your message...',
      );
      const category = await this.triage.classify(content);

      await this.db
        .update(messagesTable)
        .set({ triageCategory: category })
        .where(eq(messagesTable.id, messageId));

      if (category === 'trivial') {
        await this.savePemResponse(
          userId,
          messageId,
          this.trivialResponse(content),
        );
        return;
      }

      if (category === 'question_only') {
        await this.publishStatus(userId, messageId, 'Looking things up...');
        const answer = await this.questionService.answer(userId, content);
        await this.savePemResponse(userId, messageId, answer);
        return;
      }

      // needs_agent path
      await this.publishStatus(userId, messageId, 'Analyzing your message...');

      const ctx = await this.gatherContext(userId);

      const ragResults = await this.embeddings.similaritySearch(
        userId,
        content,
        5,
      );
      const ragContext = ragResults
        .filter((r) => r.similarity > 0.7)
        .map((r) => r.content)
        .join('\n');

      const recentMsgs = await this.getRecentMessages(userId);

      await this.publishStatus(userId, messageId, 'Working on it...');

      const agentOutput = await this.pemAgent.run({
        messageContent: content,
        userTimezone: ctx.tz,
        openExtracts: ctx.openExtracts,
        calendarEvents: ctx.calendarEvents,
        memorySection: ctx.memorySection,
        recentMessages: recentMsgs,
        ragContext,
      });

      // Apply actions
      await this.applyAgentActions(userId, messageId, agentOutput, ctx);

      // Save response
      await this.savePemResponse(userId, messageId, agentOutput.response_text);

      // Save polished text on user message
      if (agentOutput.polished_text) {
        await this.db
          .update(messagesTable)
          .set({ polishedText: agentOutput.polished_text })
          .where(eq(messagesTable.id, messageId));
      }

      // Embed user message in background (don't await)
      this.embeddings
        .embedMessage(messageId, userId, content, msg.createdAt)
        .catch((e) => this.log.warn(`Embed failed: ${e}`));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      this.log.error(`Pipeline failed for message ${messageId}: ${errMsg}`);

      if (opts?.isFinalAttempt) {
        await this.db
          .update(messagesTable)
          .set({ processingStatus: 'failed' })
          .where(eq(messagesTable.id, messageId));
        await this.savePemResponse(
          userId,
          messageId,
          'Sorry, I ran into an issue processing that. Could you try again?',
        );
      }
      throw err;
    }
  }

  private async gatherContext(userId: string) {
    const [userRow] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const tz = userRow?.timezone ?? null;

    const openRows = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          ne(extractsTable.status, 'done'),
          ne(extractsTable.status, 'dismissed'),
        ),
      );

    const openExtracts = openRows.map((r) => ({
      id: r.id,
      text: r.extractText,
      status: r.status,
      tone: r.tone,
      urgency: r.urgency,
      batch_key: r.batchKey,
      due_at: r.dueAt?.toISOString() ?? null,
      period_label: r.periodLabel,
    }));

    const calendarEvents: {
      summary: string;
      start_at: string;
      end_at: string;
      location: string | null;
    }[] = [];
    const calendarExtracts = openRows.filter((r) => r.eventStartAt);
    for (const e of calendarExtracts) {
      calendarEvents.push({
        summary: e.extractText,
        start_at: e.eventStartAt!.toISOString(),
        end_at: e.eventEndAt?.toISOString() ?? e.eventStartAt!.toISOString(),
        location: e.eventLocation,
      });
    }

    const memorySection = await this.profile.buildMemoryPromptSection(userId);

    return { tz, openRows, openExtracts, calendarEvents, memorySection };
  }

  private async getRecentMessages(userId: string) {
    const rows = await this.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.userId, userId))
      .orderBy(sql`${messagesTable.createdAt} DESC`)
      .limit(20);

    return rows.reverse().map((m) => ({
      role: m.role,
      content: m.content ?? m.transcript ?? '',
      created_at: m.createdAt.toISOString(),
    }));
  }

  private async applyAgentActions(
    userId: string,
    messageId: string,
    output: PemAgentOutput,
    ctx: Awaited<ReturnType<typeof this.gatherContext>>,
  ) {
    const createdExtractMap = new Map<number, ExtractRow>();

    // Creates
    for (let i = 0; i < output.creates.length; i++) {
      const item = output.creates[i];
      const row = await this.insertExtract(userId, messageId, item, ctx.tz);
      if (row) {
        createdExtractMap.set(i, row);
        await this.logEntry({
          userId,
          type: 'extract',
          extractId: row.id,
          messageId,
          isAgent: true,
          pemNote: 'Created from chat',
          payload: { op: 'create', source: item },
        });
      }
    }

    // Updates
    for (const upd of output.updates) {
      const row = await this.extracts.findForUser(userId, upd.extract_id);
      if (!row || row.status === 'done') continue;
      const patch: Partial<typeof extractsTable.$inferInsert> = {};
      if (upd.patch.text !== undefined) patch.extractText = upd.patch.text;
      if (upd.patch.tone !== undefined) patch.tone = upd.patch.tone;
      if (upd.patch.urgency !== undefined) patch.urgency = upd.patch.urgency;
      if (upd.patch.batch_key !== undefined)
        patch.batchKey = upd.patch.batch_key;
      if (upd.patch.due_at !== undefined)
        patch.dueAt = parseIsoDate(upd.patch.due_at);
      if (upd.patch.period_start !== undefined)
        patch.periodStart = parseIsoDate(upd.patch.period_start);
      if (upd.patch.period_end !== undefined)
        patch.periodEnd = parseIsoDate(upd.patch.period_end);
      if (upd.patch.period_label !== undefined)
        patch.periodLabel = upd.patch.period_label;
      if (upd.patch.pem_note !== undefined) patch.pemNote = upd.patch.pem_note;
      if (upd.patch.draft_text !== undefined)
        patch.draftText = upd.patch.draft_text;
      if (Object.keys(patch).length === 0) continue;
      patch.updatedAt = new Date();
      await this.db
        .update(extractsTable)
        .set(patch)
        .where(
          and(
            eq(extractsTable.id, upd.extract_id),
            eq(extractsTable.userId, userId),
          ),
        );
      await this.logEntry({
        userId,
        type: 'extract',
        extractId: upd.extract_id,
        messageId,
        isAgent: true,
        pemNote: upd.reason,
        payload: { op: 'update', patch: upd.patch },
      });
    }

    // Completions
    for (const cmd of output.completions) {
      const row = await this.extracts.findForUser(userId, cmd.extract_id);
      if (!row || row.status === 'done') continue;
      if (cmd.command === 'mark_done') {
        await this.extracts.markDone(userId, cmd.extract_id, {
          initiatedBy: 'agent',
        });
      } else if (cmd.command === 'dismiss') {
        await this.extracts.dismiss(userId, cmd.extract_id, {
          initiatedBy: 'agent',
        });
      } else if (cmd.command === 'snooze' && cmd.snooze_until_iso) {
        await this.extracts.snooze(
          userId,
          cmd.extract_id,
          'tomorrow',
          cmd.snooze_until_iso,
          { initiatedBy: 'agent' },
        );
      }
      await this.logEntry({
        userId,
        type: 'extract',
        extractId: cmd.extract_id,
        messageId,
        isAgent: true,
        pemNote: cmd.reason,
        payload: { op: cmd.command },
      });
    }

    // Calendar writes
    for (const cw of output.calendar_writes) {
      try {
        const startAt = new Date(cw.start_at);
        const endAt = new Date(cw.end_at);
        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()))
          continue;
        const result = await this.calendarSync.writeToGoogleCalendar(userId, {
          summary: cw.summary,
          start: startAt,
          end: endAt,
          location: cw.location ?? undefined,
          description: cw.description ?? undefined,
        });
        const linkedExtract =
          cw.linked_new_item_index != null
            ? createdExtractMap.get(cw.linked_new_item_index)
            : null;
        if (result && linkedExtract) {
          await this.db
            .update(extractsTable)
            .set({
              externalEventId: result.eventId,
              calendarConnectionId: result.connectionId,
              eventStartAt: startAt,
              eventEndAt: endAt,
              eventLocation: cw.location ?? null,
              updatedAt: new Date(),
            })
            .where(eq(extractsTable.id, linkedExtract.id));
        }
      } catch (e) {
        this.log.warn(
          `Calendar write failed: ${e instanceof Error ? e.message : 'unknown'}`,
        );
      }
    }

    // Memory writes
    for (const mw of output.memory_writes) {
      await this.profile.saveFromAgent(
        userId,
        mw.memory_key,
        mw.note,
        messageId,
      );
    }
  }

  private async insertExtract(
    userId: string,
    messageId: string,
    item: ExtractAction,
    tz: string | null,
  ): Promise<ExtractRow | null> {
    const dueAt = parseIsoDate(item.due_at);
    const pStart = parseIsoDate(item.period_start);
    const pEnd = parseIsoDate(item.period_end);
    const tzPending =
      !tz && (!!item.due_at?.trim() || !!item.period_start?.trim());

    const [row] = await this.db
      .insert(extractsTable)
      .values({
        userId,
        messageId,
        extractText: item.text.trim(),
        originalText: item.original_text.trim(),
        status: 'inbox',
        tone: item.tone,
        urgency: item.urgency,
        batchKey: item.batch_key,
        dueAt,
        periodStart: pStart,
        periodEnd: pEnd,
        periodLabel: item.period_label,
        timezonePending: tzPending,
        pemNote: item.pem_note?.trim() || null,
        draftText: item.draft_text?.trim() || null,
        updatedAt: new Date(),
      })
      .returning();

    return row ?? null;
  }

  private async savePemResponse(
    userId: string,
    parentMessageId: string,
    responseText: string,
  ) {
    const [pemMsg] = await this.db
      .insert(messagesTable)
      .values({
        userId,
        role: 'pem',
        kind: 'text',
        content: responseText,
        parentMessageId,
      })
      .returning();

    await this.db
      .update(messagesTable)
      .set({ processingStatus: 'done' })
      .where(eq(messagesTable.id, parentMessageId));

    await this.chatEvents.publish(userId, 'pem_message', {
      message: {
        id: pemMsg.id,
        role: pemMsg.role,
        kind: pemMsg.kind,
        content: pemMsg.content,
        parent_message_id: pemMsg.parentMessageId,
        created_at: pemMsg.createdAt.toISOString(),
      },
    });

    await this.push.notifyInboxUpdated(userId);
  }

  private async publishStatus(userId: string, messageId: string, text: string) {
    await this.chatEvents.publish(userId, 'status', { messageId, text });
  }

  private trivialResponse(content: string): string {
    const lower = content.toLowerCase().trim();
    if (lower.includes('thank') || lower.includes('thx'))
      return "You're welcome!";
    if (
      lower.includes('hi') ||
      lower.includes('hey') ||
      lower.includes('hello')
    )
      return "Hey! What's on your mind?";
    return 'Got it!';
  }

  private async logEntry(args: {
    userId: string;
    type: string;
    extractId?: string;
    messageId?: string;
    isAgent: boolean;
    pemNote: string;
    payload: Record<string, unknown>;
    error?: { message: string; stack?: string };
  }) {
    await this.db.insert(logsTable).values({
      userId: args.userId,
      type: args.type,
      extractId: args.extractId ?? null,
      messageId: args.messageId ?? null,
      pemNote: args.pemNote?.trim() || null,
      isAgent: args.isAgent,
      payload: args.payload,
      error: args.error ?? null,
    });
  }
}
