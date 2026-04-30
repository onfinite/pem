import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, isNotNull, ne, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  messagesTable,
  extractsTable,
  contactsTable,
  logsTable,
  usersTable,
  listsTable,
  type ExtractRow,
  type UserPreferences,
} from '@/database/schemas/index';
import { TriageService } from '@/modules/messaging/triage.service';
import { OrchestratorLlmService } from '@/modules/agent/orchestrator-llm.service';
import { PemAgentService } from '@/modules/agent/pem-agent.service';
import type {
  ExtractAction,
  PemAgentOutput,
} from '@/modules/agent/types/pem-agent.types';
import { ChatEventsService } from '@/modules/messaging/chat-events.service';
import { EmbeddingsService } from '@/modules/memory/embeddings.service';
import { ExtractsService } from '@/modules/extracts/services/extracts.service';
import { reconcileRelativePeriodLabel } from '@/modules/extracts/helpers/reconcile-relative-period-label';
import {
  decodePhotoVisionStored,
  visionLineForHumans,
} from '@/modules/media/photo/helpers/photo-vision-stored';
import { ProfileService } from '@/modules/profile/profile.service';
import { CalendarSyncService } from '@/modules/calendar/services/calendar-sync.service';
import { PushService } from '@/modules/push/push.service';
import { SchedulerService } from '@/modules/messaging/scheduler.service';
import { StorageService } from '@/modules/storage/storage.service';
import { ChatQuestionService } from '@/modules/agent/question/chat-question.service';
import { PhotoVisionService } from '@/modules/media/photo/photo-vision.service';
import { buildPhotoRecallMetadata } from '@/modules/media/photo/helpers/build-photo-recall-metadata';
import { buildPhotoRecallPromptSection } from '@/modules/media/photo/helpers/build-photo-recall-prompt-section';
import { orderedMessageIdsFromRecallItems } from '@/modules/media/photo/helpers/resolve-photo-recall-message-ids';
import { ChatPhotoRecallIntentService } from '@/modules/media/photo/chat-photo-recall-intent.service';
import { ImageReferenceOnlyReplyService } from '@/modules/media/photo/image-reference-only-reply.service';
import { PhotoAttachmentIntentService } from '@/modules/media/photo/photo-attachment-intent.service';
import { ChatLinkPipelineService } from '@/modules/media/links/chat-link-pipeline.service';
import { linkPreviewsSerializedFromRows } from '@/modules/media/links/helpers/chat-link-client-preview.helpers';
import {
  extractUrlOccurrencesFromText,
  extractUrlOccurrencesFromTexts,
} from '@/core/utils/extract-urls-from-text';
import {
  AGENT_RECENT_MESSAGES_LIMIT,
  DONE_EXTRACTS_LOOKBACK_DAYS,
  RAG_MIN_SIMILARITY,
  RAG_TOP_K,
} from '@/modules/chat/constants/chat.constants';
import {
  buildRecallEmbeddingAugmentation,
  detectQuestionTemporalRange,
} from '@/modules/agent/question/helpers/chat-question-temporal';
import { shouldEscalateTrivialForPhotoFollowup } from '@/modules/media/photo/helpers/photo-offer-followup';
import { normalizeDedupeTaskKey } from '@/core/utils/filter-deduped-creates';
import {
  buildRrule,
  clampAgentOutput,
  displayUrlsFromMessageLinkRows,
  mergeMessageLinksIntoExtractPemNote,
  parseIsoDate,
} from '@/modules/agent/helpers/chat-orchestrator.helpers';
import { logWithContext } from '@/core/utils/format-log-context';
import { ChatService } from '@/modules/messages/chat.service';
import { TranscriptionService } from '@/modules/media/voice/transcription.service';

@Injectable()
export class ChatOrchestratorService {
  private readonly log = new Logger(ChatOrchestratorService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly triage: TriageService,
    private readonly pemAgent: PemAgentService,
    private readonly chatEvents: ChatEventsService,
    private readonly embeddings: EmbeddingsService,
    private readonly extracts: ExtractsService,
    private readonly profile: ProfileService,
    private readonly calendarSync: CalendarSyncService,
    private readonly push: PushService,
    private readonly scheduler: SchedulerService,
    private readonly questionService: ChatQuestionService,
    private readonly storage: StorageService,
    private readonly photoVision: PhotoVisionService,
    private readonly photoRecallIntent: ChatPhotoRecallIntentService,
    private readonly imageReferenceOnlyReply: ImageReferenceOnlyReplyService,
    private readonly photoAttachmentIntent: PhotoAttachmentIntentService,
    private readonly linkPipeline: ChatLinkPipelineService,
    private readonly orchestratorLlm: OrchestratorLlmService,
    private readonly chat: ChatService,
    private readonly transcription: TranscriptionService,
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
      this.log.warn(
        logWithContext('Message not found', {
          messageId,
          userId,
          scope: 'chat_orchestrator',
        }),
      );
      return;
    }

    if (msg.userId !== userId) {
      this.log.warn(
        logWithContext('Message user mismatch', {
          messageId,
          userId,
          rowUserId: msg.userId,
          scope: 'chat_orchestrator',
        }),
      );
      return;
    }

    if (msg.processingStatus === 'done') {
      this.log.log(
        logWithContext('processMessage skip already done', {
          messageId,
          userId,
          scope: 'chat_orchestrator',
        }),
      );
      return;
    }

    try {
      await this.db
        .update(messagesTable)
        .set({ processingStatus: 'processing' })
        .where(eq(messagesTable.id, messageId));

      await this.publishStatus(userId, messageId, 'Processing...');

      let content = msg.content ?? '';

      const voiceKey = (msg.audioKey ?? msg.voiceUrl)?.trim() ?? '';
      const canTranscribeInWorker =
        msg.kind === 'voice' &&
        !msg.transcript?.trim() &&
        !content.trim() &&
        voiceKey.length > 0 &&
        this.storage.enabled;

      if (canTranscribeInWorker) {
        await this.publishStatus(userId, messageId, 'Transcribing voice...');
        const downloaded = await this.storage.downloadObject(voiceKey);
        if (!downloaded?.buffer.length) {
          throw new Error('Voice audio missing from storage');
        }
        const transcriptText = await this.transcription.transcribeFromBuffer({
          buffer: downloaded.buffer,
          mimetype: downloaded.contentType,
          originalname: 'recording.m4a',
        });
        await this.chat.updateMessage(
          messageId,
          { content: transcriptText, transcript: transcriptText },
          userId,
        );
        await this.chatEvents.publish(userId, 'message_updated', {
          messageId,
          field: 'transcript',
          value: transcriptText,
        });
        await this.chatEvents.publish(userId, 'message_updated', {
          messageId,
          field: 'content',
          value: transcriptText,
        });
        content = transcriptText;
      } else if (msg.transcript?.trim()) {
        content = msg.transcript;
      }

      const hasUserImages =
        (msg.imageKeys ?? []).filter((a) => a.key).length > 0;

      if (msg.kind === 'image') {
        content = await this.resolveImagePipelineContent(msg, userId);
      } else if (msg.kind === 'voice' && hasUserImages) {
        content = await this.resolveImagePipelineContent(msg, userId);
      }

      if (!content.trim()) {
        await this.savePemResponse(
          userId,
          messageId,
          "I couldn't understand that. Could you try again?",
        );
        return;
      }

      // Content moderation — fast, free via OpenAI moderation endpoint
      const isFlagged = await this.checkModeration(content);
      if (isFlagged) {
        await this.savePemResponse(
          userId,
          messageId,
          "I'm not able to help with that kind of request. I'm here to organize your tasks, calendar, and thoughts — let me know what's on your mind.",
        );
        this.queueUserMessageEmbedding(msg, content);
        return;
      }

      const urlOccurrences =
        msg.kind === 'image' || (msg.kind === 'voice' && hasUserImages)
          ? extractUrlOccurrencesFromTexts(
              content,
              msg.content ?? '',
              msg.transcript ?? '',
            )
          : extractUrlOccurrencesFromText(content);

      if (msg.kind === 'image' || (msg.kind === 'voice' && hasUserImages)) {
        const runInboxExtraction =
          await this.photoAttachmentIntent.isDirectiveOrganizeIntent(content);
        if (!runInboxExtraction) {
          if (urlOccurrences.length === 0) {
            await this.publishStatus(userId, messageId, 'Saving your photo…');
            const reply =
              await this.imageReferenceOnlyReply.composeReply(content);
            await this.savePemResponse(userId, messageId, reply, {
              image_reference_only: true,
            });
            this.queueUserMessageEmbedding(msg, content);
            this.tryLightweightMemoryExtraction(userId, messageId, content);
            return;
          }
        }
      }

      let linkPipelineResult: Awaited<
        ReturnType<ChatLinkPipelineService['processForMessage']>
      > | null = null;

      if (urlOccurrences.length > 0) {
        await this.publishStatus(userId, messageId, 'Reading link…');
        linkPipelineResult = await this.linkPipeline.processForMessage(
          userId,
          messageId,
          urlOccurrences,
        );
        if (linkPipelineResult.rows.length > 0) {
          await this.chatEvents.publish(userId, 'message_updated', {
            messageId,
            field: 'link_previews',
            value: linkPreviewsSerializedFromRows(linkPipelineResult.rows),
          });
        }
      }

      // Triage
      await this.publishStatus(
        userId,
        messageId,
        'Understanding your message...',
      );
      const categoryRaw = await this.triage.classify(content);
      // Habits / commitments ("I must run every day…") must run the task pipeline, not Ask-only.
      const category =
        categoryRaw === 'question_only' &&
        /\b(i\s+must|i\s+have\s+to)\b/i.test(content.trim())
          ? 'needs_agent'
          : categoryRaw;

      await this.db
        .update(messagesTable)
        .set({ triageCategory: category })
        .where(eq(messagesTable.id, messageId));

      if (category === 'trivial') {
        const recentForOffer = (await this.getRecentMessages(userId)).map(
          (m) => ({ role: m.role, content: m.content }),
        );
        if (!shouldEscalateTrivialForPhotoFollowup(content, recentForOffer)) {
          await this.savePemResponse(
            userId,
            messageId,
            this.trivialResponse(content),
          );
          this.queueUserMessageEmbedding(msg, content);
          this.tryLightweightMemoryExtraction(userId, messageId, content);
          return;
        }
      }

      if (category === 'off_topic') {
        const redirect = await this.generateOffTopicRedirect(content);
        await this.savePemResponse(userId, messageId, redirect);
        this.queueUserMessageEmbedding(msg, content);
        this.tryLightweightMemoryExtraction(userId, messageId, content);
        return;
      }

      if (category === 'question_only') {
        await this.publishStatus(userId, messageId, 'Looking things up...');
        const [userRow] = await this.db
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        const { text: answerText, metadata: answerMeta } =
          await this.questionService.answer(
            userId,
            content,
            userRow?.name ?? null,
            userRow?.summary ?? null,
            linkPipelineResult?.promptSection ?? null,
          );
        const mergedQuestionMeta =
          linkPipelineResult?.rows.length && answerMeta
            ? {
                ...answerMeta,
                link_previews: linkPreviewsSerializedFromRows(
                  linkPipelineResult.rows,
                ),
              }
            : linkPipelineResult?.rows.length
              ? {
                  link_previews: linkPreviewsSerializedFromRows(
                    linkPipelineResult.rows,
                  ),
                }
              : answerMeta;
        const pemMsg = await this.savePemResponse(
          userId,
          messageId,
          answerText,
          mergedQuestionMeta,
        );

        const userUrlNorm = new Set(urlOccurrences.map((o) => o.normalized));
        const urlsOnlyInAnswer = extractUrlOccurrencesFromText(
          answerText,
        ).filter((o) => !userUrlNorm.has(o.normalized));
        if (urlsOnlyInAnswer.length > 0) {
          try {
            const answerLinkRows = await this.linkPipeline.processForMessage(
              userId,
              pemMsg.id,
              urlsOnlyInAnswer,
            );
            if (answerLinkRows.rows.length > 0) {
              await this.chatEvents.publish(userId, 'message_updated', {
                messageId: pemMsg.id,
                field: 'link_previews',
                value: linkPreviewsSerializedFromRows(answerLinkRows.rows),
              });
            }
          } catch (e) {
            this.log.warn(
              logWithContext('Ask reply link previews failed', {
                userId,
                messageId,
                pemMessageId: pemMsg.id,
                scope: 'chat_orchestrator',
                err: e instanceof Error ? e.message : String(e),
              }),
            );
          }
        }

        this.queueUserMessageEmbedding(msg, content);
        return;
      }

      // needs_agent path
      if (!this.config.get<string>('openai.apiKey')) {
        this.log.error(
          logWithContext('OpenAI API key not configured — cannot run agent', {
            userId,
            messageId,
            scope: 'chat_orchestrator',
          }),
        );
        await this.savePemResponse(
          userId,
          messageId,
          "I'm having trouble processing right now. Please try again shortly.",
        );
        this.queueUserMessageEmbedding(msg, content);
        return;
      }

      await this.publishStatus(userId, messageId, 'Analyzing your message...');

      const ctx = await this.gatherContext(userId);

      const temporalRange = detectQuestionTemporalRange(
        content,
        new Date(),
        ctx.tz,
      );
      const ragVectorQuery = temporalRange
        ? `${content}\n\n${buildRecallEmbeddingAugmentation(temporalRange)}`
        : content;
      const ragSimilarityOpts = temporalRange
        ? {
            temporalBoost: {
              start: temporalRange.start,
              end: temporalRange.end,
            },
          }
        : undefined;

      const ragResults = await this.embeddings.similaritySearch(
        userId,
        ragVectorQuery,
        RAG_TOP_K,
        RAG_MIN_SIMILARITY,
        ragSimilarityOpts,
      );
      const ragContext = ragResults.map((r) => r.content).join('\n');

      const photoRecallClassifierText =
        msg.kind === 'image' || (msg.kind === 'voice' && hasUserImages)
          ? [msg.content, msg.transcript]
              .map((s) => (s ?? '').trim())
              .filter(Boolean)
              .join('\n')
              .trim()
          : '';

      const { attachStrip, messageIds: photoRecallMessageIds } =
        await this.photoRecallIntent.resolveStripAndMessageIds({
          userId,
          userText: content,
          ...(photoRecallClassifierText
            ? { classifierUserText: photoRecallClassifierText }
            : {}),
          vectorQueryText: ragVectorQuery,
          ragMessageIds: ragResults.map((r) => r.messageId),
          excludeMessageId: messageId,
          vectorSearchOpts: ragSimilarityOpts,
        });
      let photoRecallMeta: Awaited<ReturnType<typeof buildPhotoRecallMetadata>>;
      if (attachStrip && photoRecallMessageIds.length > 0) {
        photoRecallMeta = await buildPhotoRecallMetadata(
          this.db,
          this.storage,
          userId,
          photoRecallMessageIds,
        );
      } else {
        photoRecallMeta = undefined;
      }

      const idsForPhotoRecallPrompt = photoRecallMeta?.photo_recall?.length
        ? orderedMessageIdsFromRecallItems(photoRecallMeta.photo_recall)
        : photoRecallMessageIds;

      const photoRecallPromptBlock =
        idsForPhotoRecallPrompt.length > 0
          ? await buildPhotoRecallPromptSection(
              this.db,
              userId,
              idsForPhotoRecallPrompt,
              new Date(),
              ctx.tz,
            )
          : undefined;

      const recentMsgs = await this.getRecentMessages(userId);

      await this.publishStatus(userId, messageId, 'Working on it...');

      let schedulingContext = '';
      let userPreferences = '';
      try {
        schedulingContext = await this.scheduler.buildSchedulingContext(
          userId,
          ctx.tz ?? 'UTC',
        );
        if (ctx.prefs) {
          const p = ctx.prefs;
          const parts: string[] = [];
          if (p.work_hours)
            parts.push(
              `Work hours: ${p.work_hours.start} - ${p.work_hours.end}`,
            );
          if (p.work_type) parts.push(`Work type: ${p.work_type}`);
          if (p.personal_windows?.length)
            parts.push(`Personal tasks: ${p.personal_windows.join(', ')}`);
          if (p.errand_window) parts.push(`Errands: ${p.errand_window}`);
          userPreferences = parts.join('\n');
        }
      } catch (e) {
        this.log.warn(
          logWithContext('Scheduling context failed', {
            userId,
            messageId,
            scope: 'chat_orchestrator',
            err: e instanceof Error ? e.message : 'unknown',
          }),
        );
      }

      const slowStatusTimer = setTimeout(() => {
        this.publishStatus(userId, messageId, 'Organizing your tasks...').catch(
          () => {},
        );
      }, 5_000);

      const wordCount = content.split(/\s+/).length;
      const isLongVoiceMemo = msg.kind === 'voice' && wordCount > 500;

      const agentOutputRaw = await this.pemAgent.run({
        messageContent: content,
        isLongVoiceMemo,
        userTimezone: ctx.tz,
        openExtracts: ctx.openExtracts,
        calendarEvents: ctx.calendarEvents,
        memorySection: ctx.memorySection,
        recentMessages: recentMsgs,
        ragContext,
        photoRecallContext: photoRecallPromptBlock,
        linkContext: linkPipelineResult?.promptSection,
        userName: ctx.userName,
        userSummary: ctx.userSummary,
        schedulingContext,
        userPreferences,
        recentClosedSection: ctx.recentClosedSection,
        todayCalendarSection: ctx.todayCalendarSection,
        userActivityLine: ctx.userActivityLine,
        userLists: ctx.userLists,
        contacts: ctx.contacts,
        dedupeActiveTaskKeys: [...ctx.activeTaskKeys],
        dedupeClosedTaskKeys: [...ctx.closedKeys],
      });

      clearTimeout(slowStatusTimer);

      const agentOutput = clampAgentOutput(agentOutputRaw);

      const messageLinkDisplayUrls = linkPipelineResult?.rows.length
        ? displayUrlsFromMessageLinkRows(linkPipelineResult.rows)
        : [];
      if (
        messageLinkDisplayUrls.length === 0 &&
        agentOutput.creates.length > 0 &&
        urlOccurrences.length > 0
      ) {
        const seen = new Set<string>();
        for (const o of urlOccurrences) {
          const raw = o.raw.trim();
          const u = /^https?:\/\//i.test(raw) ? raw : o.normalized.trim();
          if (u && !seen.has(u)) {
            seen.add(u);
            messageLinkDisplayUrls.push(u);
          }
        }
      }

      // Apply actions
      await this.applyAgentActions(
        userId,
        messageId,
        agentOutput,
        ctx,
        messageLinkDisplayUrls,
      );

      // Build metadata for the response message
      const meta: Record<string, unknown> = {};
      if (agentOutput.creates.length)
        meta.tasks_created = agentOutput.creates.length;
      if (agentOutput.updates.length)
        meta.tasks_updated = agentOutput.updates.length;
      if (agentOutput.completions.length)
        meta.tasks_completed = agentOutput.completions.length;
      if (agentOutput.calendar_writes.length)
        meta.calendar_written = agentOutput.calendar_writes.length;
      if (agentOutput.calendar_updates.length)
        meta.calendar_updated = agentOutput.calendar_updates.length;
      if (agentOutput.calendar_deletes.length)
        meta.calendar_deleted = agentOutput.calendar_deletes.length;
      if (photoRecallMeta?.photo_recall?.length) {
        meta.photo_recall = photoRecallMeta.photo_recall;
      }
      if (linkPipelineResult?.rows.length) {
        meta.link_previews = linkPreviewsSerializedFromRows(
          linkPipelineResult.rows,
        );
      }
      const metadata = Object.keys(meta).length > 0 ? meta : undefined;

      // Save response
      await this.savePemResponse(
        userId,
        messageId,
        agentOutput.response_text,
        metadata,
      );

      if (agentOutput.polished_text) {
        const updateFields: Record<string, string> = {
          polishedText: agentOutput.polished_text,
        };
        if (msg.kind === 'voice' && !msg.summary) {
          updateFields.summary = agentOutput.polished_text;
        }
        await this.db
          .update(messagesTable)
          .set(updateFields)
          .where(eq(messagesTable.id, messageId));
      }

      this.queueUserMessageEmbedding(msg, content);

      // Seed initial summary if user has none yet
      if (!ctx.userSummary) {
        this.seedSummaryIfReady(userId).catch((e) =>
          this.log.warn(
            logWithContext('Summary seed failed', {
              userId,
              messageId,
              scope: 'chat_orchestrator',
              err: e instanceof Error ? e.message : String(e),
            }),
          ),
        );
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      this.log.error(
        logWithContext('Chat pipeline failed', {
          userId,
          messageId,
          scope: 'chat_orchestrator',
          err: errMsg,
          isFinalAttempt: opts?.isFinalAttempt === true,
        }),
      );

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
        await this.chatEvents.publish(userId, 'processing_failed', {
          messageId,
        });

        const failContent = msg.transcript ?? msg.content ?? '';
        if (failContent.trim()) {
          this.queueUserMessageEmbedding(msg, failContent);
        }
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
    const tz = userRow?.timezone ?? 'UTC';

    const allOpenRows = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          ne(extractsTable.status, 'closed'),
        ),
      );

    const now = new Date();
    const openRows = allOpenRows.filter((r) => {
      const isCalEvent = r.source === 'calendar' || !!r.externalEventId;
      if (isCalEvent && r.eventEndAt && r.eventEndAt < now) return false;
      return true;
    });

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

    const closedSince = new Date(now);
    closedSince.setUTCDate(
      closedSince.getUTCDate() - DONE_EXTRACTS_LOOKBACK_DAYS,
    );

    const recentlyClosedRows = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.status, 'closed'),
          isNotNull(extractsTable.closedAt),
          gte(extractsTable.closedAt, closedSince),
        ),
      )
      .orderBy(desc(extractsTable.closedAt))
      .limit(120);

    const thirtyAgo = new Date(now);
    thirtyAgo.setUTCDate(thirtyAgo.getUTCDate() - 30);
    const countRows = await this.db
      .select({ userMsgCount: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, userId),
          eq(messagesTable.role, 'user'),
          gte(messagesTable.createdAt, thirtyAgo),
        ),
      );
    const userMsgCount = countRows[0]?.userMsgCount ?? 0;

    const activeTaskKeys = new Set(
      openRows
        .map((r) => normalizeDedupeTaskKey(r.extractText))
        .filter((k) => k.length > 0),
    );
    const closedKeys = new Set(
      recentlyClosedRows
        .map((r) => normalizeDedupeTaskKey(r.extractText))
        .filter((k) => k.length > 0),
    );

    const calendarEvents: {
      id: string;
      summary: string;
      start_at: string;
      end_at: string;
      location: string | null;
      description: string | null;
      is_organizer: boolean;
      source: string;
    }[] = [];
    const calendarExtracts = openRows.filter((r) => r.eventStartAt);
    for (const e of calendarExtracts) {
      calendarEvents.push({
        id: e.id,
        summary: e.extractText,
        start_at: e.eventStartAt!.toISOString(),
        end_at: e.eventEndAt?.toISOString() ?? e.eventStartAt!.toISOString(),
        location: e.eventLocation,
        description: e.pemNote,
        is_organizer: e.isOrganizer ?? true,
        source: e.source ?? 'dump',
      });
    }

    const dayStart = DateTime.now().setZone(tz).startOf('day');
    const dayEnd = dayStart.endOf('day');
    const todayLines: string[] = [];
    for (const ev of calendarEvents) {
      const start = DateTime.fromISO(ev.start_at, { setZone: true }).setZone(
        tz,
      );
      if (!start.isValid) continue;
      if (start < dayStart || start > dayEnd) continue;
      const loc = ev.location ? ` at ${ev.location}` : '';
      todayLines.push(`- ${ev.summary}: ${start.toFormat('h:mm a')}${loc}`);
    }
    const todayCalendarSection =
      todayLines.length > 0
        ? todayLines.join('\n')
        : '(no timed items on your list for today)';

    const recentClosedSection =
      recentlyClosedRows.length > 0
        ? recentlyClosedRows
            .map((r) => {
              const when = r.closedAt
                ? r.closedAt.toISOString().slice(0, 10)
                : '';
              return `- ${r.extractText}${when ? ` (closed ${when})` : ''}`;
            })
            .join('\n')
        : '(none in lookback window)';

    const userActivityLine = `User messages in Pem (last 30 days): ${userMsgCount}.`;

    const memorySection = await this.profile.buildMemoryPromptSection(userId);

    let userLists: { id: string; name: string }[] = [];
    try {
      const listRows = await this.db
        .select({ id: listsTable.id, name: listsTable.name })
        .from(listsTable)
        .where(eq(listsTable.userId, userId));
      userLists = listRows;
    } catch {
      /* lists table may not exist yet in some envs */
    }

    let contacts: {
      email: string;
      name: string | null;
      meetingCount: number;
      lastMetAt: Date | null;
    }[] = [];
    try {
      contacts = await this.db
        .select({
          email: contactsTable.email,
          name: contactsTable.name,
          meetingCount: contactsTable.meetingCount,
          lastMetAt: contactsTable.lastMetAt,
        })
        .from(contactsTable)
        .where(eq(contactsTable.userId, userId))
        .orderBy(desc(contactsTable.meetingCount))
        .limit(100);
    } catch {
      /* contacts table may not exist yet in some envs */
    }

    return {
      tz: userRow?.timezone ?? null,
      openRows,
      openExtracts,
      calendarEvents,
      activeTaskKeys,
      closedKeys,
      memorySection,
      userName: userRow?.name ?? null,
      userSummary: userRow?.summary ?? null,
      prefs: (userRow?.preferences as UserPreferences) ?? null,
      recentClosedSection,
      todayCalendarSection,
      userActivityLine,
      userLists,
      contacts,
    };
  }

  private queueUserMessageEmbedding(
    msg: { id: string; userId: string; createdAt: Date },
    text: string,
  ): void {
    const t = text?.trim() ?? '';
    if (!t) return;
    void this.embeddings
      .embedChatMessageIfAbsent({
        messageId: msg.id,
        userId: msg.userId,
        role: 'user',
        text: t,
        createdAt: msg.createdAt,
      })
      .catch((e) =>
        this.log.warn(
          logWithContext('User message embed failed', {
            userId: msg.userId,
            messageId: msg.id,
            scope: 'chat_orchestrator',
            err: e instanceof Error ? e.message : String(e),
          }),
        ),
      );
  }

  private async getRecentMessages(userId: string) {
    const rows = await this.db
      .select()
      .from(messagesTable)
      .where(eq(messagesTable.userId, userId))
      .orderBy(sql`${messagesTable.createdAt} DESC`)
      .limit(AGENT_RECENT_MESSAGES_LIMIT);

    return rows.reverse().map((m) => ({
      role: m.role,
      content: this.lineForRecentMessage(m),
      created_at: m.createdAt.toISOString(),
    }));
  }

  private lineForRecentMessage(
    m: (typeof messagesTable)['$inferSelect'],
  ): string {
    if (m.role === 'pem') return m.content ?? '';
    if (m.kind === 'image') {
      const cap = (m.content ?? '').trim();
      const vis = visionLineForHumans(m.visionSummary ?? '');
      if (cap && vis) return `${cap}\n[Photo: ${vis}]`;
      if (vis) return `[Photo: ${vis}]`;
      if (cap) return `${cap} [photo]`;
      return '[photo]';
    }
    const voiceLine = m.transcript ?? m.content ?? '';
    const imgCount = (m.imageKeys ?? []).filter((a) => a.key).length;
    if (m.kind === 'voice' && imgCount > 0) {
      const vis = visionLineForHumans(m.visionSummary ?? '');
      const t = voiceLine.trim();
      if (t && vis) return `${t}\n[Photo: ${vis}]`;
      if (vis) return `[Photo: ${vis}]`;
      if (t) return `${t} [photo]`;
      return '[voice + photo]';
    }
    return voiceLine;
  }

  private async resolveImagePipelineContent(
    msg: (typeof messagesTable)['$inferSelect'],
    userId: string,
  ): Promise<string> {
    let visionFlat = msg.visionSummary?.trim() ?? '';
    const modelId = this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

    const imageAssets = (msg.imageKeys ?? []).filter((a) => a.key);
    if (!visionFlat && imageAssets.length > 0 && this.storage.enabled) {
      const sections: string[] = [];
      try {
        for (let i = 0; i < imageAssets.length; i++) {
          const asset = imageAssets[i];
          const downloaded = await this.storage.downloadObject(asset.key);
          if (!downloaded) continue;
          const mime =
            asset.mime?.trim() ||
            (downloaded.contentType.startsWith('image/')
              ? downloaded.contentType
              : 'image/jpeg');
          const analyzed = await this.photoVision.analyzeImage(
            downloaded.buffer,
            mime,
          );
          if (analyzed) {
            sections.push(
              `[Photo ${i + 1}/${imageAssets.length}]\n${analyzed.flatSummary}`,
            );
          }
        }
        visionFlat = sections.join('\n\n---\n\n');
        if (visionFlat) {
          await this.db
            .update(messagesTable)
            .set({
              visionSummary: visionFlat,
              visionModel: modelId,
              visionCompletedAt: new Date(),
            })
            .where(
              and(
                eq(messagesTable.id, msg.id),
                eq(messagesTable.userId, userId),
              ),
            );
        }
      } catch (e) {
        this.log.warn(
          logWithContext('Image vision pipeline failed', {
            userId,
            messageId: msg.id,
            scope: 'chat_orchestrator',
            err: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    }

    const cap = (msg.content ?? '').trim();
    const n = imageAssets.length;
    const parts: string[] = [];
    if (cap) parts.push(`User photo caption: ${cap}`);
    if (visionFlat) {
      const { focus, detail } = decodePhotoVisionStored(visionFlat);
      if (focus && detail) {
        parts.push(
          `Image — for your reply (keep response_text grounded here; short and natural; do not invent):\n${focus}\n\nImage — full detail for tasks / memory / calendar (do not read this aloud; use for extraction and follow-ups):\n${detail}`,
        );
      } else {
        parts.push(`Image description: ${visionFlat}`);
      }
    }
    if (parts.length > 0) {
      return parts.join('\n\n');
    }
    if (n > 1) {
      return 'User attached photos in chat. No visual description was captured (images could not be read from storage or vision). Ask what they want Pem to remember or organize, or suggest they add a short caption.';
    }
    return 'User attached a photo in chat. No visual description was captured (image could not be read from storage or vision). Ask what they want Pem to remember or organize, or suggest they add a one-line caption.';
  }

  private async applyAgentActions(
    userId: string,
    messageId: string,
    output: PemAgentOutput,
    ctx: Awaited<ReturnType<typeof this.gatherContext>>,
    messageLinkDisplayUrls: string[] = [],
  ) {
    const createdExtractMap = new Map<number, ExtractRow>();
    const chatExtractLog = { surface: 'chat' as const };

    // Creates
    for (let i = 0; i < output.creates.length; i++) {
      const item = mergeMessageLinksIntoExtractPemNote(
        output.creates[i],
        messageLinkDisplayUrls,
      );
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
          payload: { op: 'create', source: item, ...chatExtractLog },
        });
      }
    }

    // Updates
    for (const upd of output.updates) {
      const row = await this.extracts.findForUser(userId, upd.extract_id);
      if (!row || row.status === 'closed') continue;

      // Strip null values that the model included without the user asking.
      // Only list_name uses null intentionally ("remove from list").
      const CLEARABLE_BY_NULL = new Set(['list_name']);
      const p = upd.patch as Record<string, unknown>;
      for (const [key, val] of Object.entries(p)) {
        if (val === null && !CLEARABLE_BY_NULL.has(key)) {
          delete p[key];
        }
      }

      const patch: Partial<typeof extractsTable.$inferInsert> = {};
      if (upd.patch.text !== undefined) patch.extractText = upd.patch.text;
      if (upd.patch.tone !== undefined) patch.tone = upd.patch.tone;
      if (upd.patch.urgency !== undefined) patch.urgency = upd.patch.urgency;
      if (upd.patch.batch_key !== undefined)
        patch.batchKey = upd.patch.batch_key;
      if (upd.patch.list_name !== undefined) {
        if (upd.patch.list_name === null || upd.patch.list_name === '') {
          patch.listId = null;
        } else {
          const resolvedListId = await this.resolveListId(
            userId,
            upd.patch.list_name,
            upd.patch.create_list,
          );
          if (resolvedListId) patch.listId = resolvedListId;
        }
      }
      if (upd.patch.priority !== undefined) patch.priority = upd.patch.priority;
      if (upd.patch.due_at !== undefined)
        patch.dueAt = parseIsoDate(upd.patch.due_at);
      if (upd.patch.period_start !== undefined)
        patch.periodStart = parseIsoDate(upd.patch.period_start);
      if (upd.patch.period_end !== undefined)
        patch.periodEnd = parseIsoDate(upd.patch.period_end);
      if (upd.patch.period_label !== undefined)
        patch.periodLabel = upd.patch.period_label;
      const periodTouched =
        upd.patch.period_start !== undefined ||
        upd.patch.period_end !== undefined ||
        upd.patch.period_label !== undefined;
      if (periodTouched) {
        const nextStart = patch.periodStart ?? row.periodStart;
        const nextLabel = patch.periodLabel ?? row.periodLabel;
        if (nextStart && nextLabel && typeof nextLabel === 'string') {
          const fixed = reconcileRelativePeriodLabel(
            nextLabel,
            nextStart instanceof Date ? nextStart : new Date(nextStart),
            ctx.tz,
          );
          if (fixed !== nextLabel) {
            patch.periodLabel = fixed ?? null;
          }
        }
      }
      if (upd.patch.pem_note !== undefined) patch.pemNote = upd.patch.pem_note;
      if (upd.patch.event_start_at !== undefined)
        patch.eventStartAt = parseIsoDate(upd.patch.event_start_at);
      if (upd.patch.event_end_at !== undefined)
        patch.eventEndAt = parseIsoDate(upd.patch.event_end_at);
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
        payload: { op: 'update', patch: upd.patch, ...chatExtractLog },
      });
    }

    // Completions
    for (const cmd of output.completions) {
      const row = await this.extracts.findForUser(userId, cmd.extract_id);
      if (!row || row.status === 'closed') continue;
      if (cmd.command === 'close') {
        await this.extracts.markClosed(userId, cmd.extract_id, {
          initiatedBy: 'agent',
        });
      } else if (cmd.command === 'reopen') {
        await this.extracts.unclose(userId, cmd.extract_id, {
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
        payload: { op: cmd.command, ...chatExtractLog },
      });
    }

    // Pre-compute recurrence rules keyed by create_index for calendar writes
    const recurrenceByIndex = new Map<number, string[]>();
    for (const rec of output.recurrence_detections) {
      if (rec.create_index < 0 || rec.create_index >= output.creates.length) {
        this.log.warn(
          logWithContext('Recurrence create_index out of bounds — skipping', {
            userId,
            messageId,
            createIndex: rec.create_index,
            createsLength: output.creates.length,
            scope: 'chat_orchestrator',
          }),
        );
        continue;
      }
      recurrenceByIndex.set(rec.create_index, [buildRrule(rec.rule)]);
    }

    // Calendar writes
    for (const cw of output.calendar_writes) {
      try {
        const startAt = new Date(cw.start_at);
        const endAt = new Date(cw.end_at);
        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()))
          continue;

        if (
          cw.linked_new_item_index != null &&
          (cw.linked_new_item_index < 0 ||
            cw.linked_new_item_index >= output.creates.length)
        ) {
          this.log.warn(
            logWithContext(
              'calendar linked_new_item_index out of bounds — unlinking',
              {
                userId,
                messageId,
                linkedNewItemIndex: cw.linked_new_item_index,
                createsLength: output.creates.length,
                scope: 'chat_orchestrator',
              },
            ),
          );
          cw.linked_new_item_index = null;
        }

        const rrule =
          cw.linked_new_item_index != null
            ? recurrenceByIndex.get(cw.linked_new_item_index)
            : undefined;
        const result = await this.calendarSync.writeToGoogleCalendar(userId, {
          summary: cw.summary,
          start: startAt,
          end: endAt,
          isAllDay: cw.is_all_day ?? false,
          location: cw.location ?? undefined,
          description: cw.description ?? undefined,
          attendees: cw.attendees?.length
            ? cw.attendees.map((a) => ({ email: a.email }))
            : undefined,
          recurrence: rrule,
          reminderMinutes: cw.reminder_minutes ?? undefined,
        });
        const linkedExtract =
          cw.linked_new_item_index != null
            ? createdExtractMap.get(cw.linked_new_item_index)
            : null;
        if (linkedExtract) {
          const eventPatch: Record<string, unknown> = {
            eventStartAt: startAt,
            eventEndAt: endAt,
            eventLocation: cw.location ?? null,
            isOrganizer: true,
            updatedAt: new Date(),
          };
          if (result) {
            eventPatch.externalEventId = result.eventId;
            eventPatch.calendarConnectionId = result.connectionId;
          }
          await this.db
            .update(extractsTable)
            .set(eventPatch)
            .where(eq(extractsTable.id, linkedExtract.id));
        }
      } catch (e) {
        this.log.warn(
          logWithContext('Calendar write failed', {
            userId,
            messageId,
            scope: 'chat_orchestrator',
            err: e instanceof Error ? e.message : 'unknown',
          }),
        );
      }
    }

    // Calendar updates (reschedule)
    for (const cu of output.calendar_updates) {
      try {
        const row = await this.extracts.findForUser(userId, cu.extract_id);
        if (!row || !row.externalEventId || !row.calendarConnectionId) continue;

        await this.calendarSync.updateGoogleCalendarEvent(
          row.calendarConnectionId,
          row.externalEventId,
          {
            summary: cu.summary,
            start: cu.start_at ? new Date(cu.start_at) : undefined,
            end: cu.end_at ? new Date(cu.end_at) : undefined,
            location: cu.location ?? undefined,
            description: cu.description ?? undefined,
            attendees: cu.attendees?.length
              ? cu.attendees.map((a) => ({ email: a.email }))
              : undefined,
          },
        );

        const patch: Record<string, unknown> = { updatedAt: new Date() };
        if (cu.start_at) patch.eventStartAt = new Date(cu.start_at);
        if (cu.end_at) patch.eventEndAt = new Date(cu.end_at);
        if (cu.location !== undefined) patch.eventLocation = cu.location;
        if (cu.summary) patch.extractText = cu.summary;
        await this.db
          .update(extractsTable)
          .set(patch)
          .where(
            and(
              eq(extractsTable.id, cu.extract_id),
              eq(extractsTable.userId, userId),
            ),
          );

        await this.logEntry({
          userId,
          type: 'extract',
          extractId: cu.extract_id,
          messageId,
          isAgent: true,
          pemNote: 'Calendar event updated',
          payload: { op: 'calendar_update', update: cu, ...chatExtractLog },
        });
      } catch (e) {
        this.log.warn(
          logWithContext('Calendar update failed', {
            userId,
            messageId,
            extractId: cu.extract_id,
            scope: 'chat_orchestrator',
            err: e instanceof Error ? e.message : 'unknown',
          }),
        );
      }
    }

    // Calendar deletes
    for (const cd of output.calendar_deletes) {
      try {
        const row = await this.extracts.findForUser(userId, cd.extract_id);
        if (!row || !row.externalEventId || !row.calendarConnectionId) continue;

        await this.calendarSync.deleteFromGoogleCalendar(
          row.calendarConnectionId,
          row.externalEventId,
        );

        await this.extracts.markClosed(
          userId,
          cd.extract_id,
          { initiatedBy: 'agent' },
          { skipCalendarEffects: true },
        );

        await this.logEntry({
          userId,
          type: 'extract',
          extractId: cd.extract_id,
          messageId,
          isAgent: true,
          pemNote: cd.reason || 'Calendar event deleted',
          payload: { op: 'calendar_delete', ...chatExtractLog },
        });
      } catch (e) {
        this.log.warn(
          logWithContext('Calendar delete failed', {
            userId,
            messageId,
            extractId: cd.extract_id,
            scope: 'chat_orchestrator',
            err: e instanceof Error ? e.message : 'unknown',
          }),
        );
      }
    }

    // Apply scheduling
    for (const sched of output.scheduling) {
      const row = createdExtractMap.get(sched.create_index);
      if (!row) continue;
      await this.db
        .update(extractsTable)
        .set({
          scheduledAt: parseIsoDate(sched.scheduled_at),
          durationMinutes: sched.duration_minutes,
          autoScheduled: true,
          schedulingReason: sched.reasoning,
          updatedAt: new Date(),
        })
        .where(eq(extractsTable.id, row.id));
    }

    // Apply recurrence rules
    for (const rec of output.recurrence_detections) {
      const row = createdExtractMap.get(rec.create_index);
      if (!row) continue;
      await this.db
        .update(extractsTable)
        .set({
          recurrenceRule: {
            ...rec.rule,
            until: rec.rule.until ?? undefined,
          },
          updatedAt: new Date(),
        })
        .where(eq(extractsTable.id, row.id));
    }

    // Apply RSVP actions — update local DB and sync to Google Calendar
    for (const rsvp of output.rsvp_actions) {
      try {
        await this.db
          .update(extractsTable)
          .set({
            rsvpStatus: rsvp.response,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(extractsTable.id, rsvp.extract_id),
              eq(extractsTable.userId, userId),
            ),
          );

        const row = await this.extracts.findForUser(userId, rsvp.extract_id);
        if (row?.externalEventId && row.calendarConnectionId) {
          await this.calendarSync
            .rsvpOnGoogle(
              row.calendarConnectionId,
              row.externalEventId,
              rsvp.response,
            )
            .catch((e) =>
              this.log.warn(
                logWithContext('Google RSVP sync failed', {
                  userId,
                  messageId,
                  extractId: rsvp.extract_id,
                  scope: 'chat_orchestrator',
                  err: e instanceof Error ? e.message : 'unknown',
                }),
              ),
            );
        }
      } catch (e) {
        this.log.warn(
          logWithContext('RSVP action failed', {
            userId,
            messageId,
            extractId: rsvp.extract_id,
            scope: 'chat_orchestrator',
            err: e instanceof Error ? e.message : 'unknown',
          }),
        );
      }
    }

    // Memory writes — skip entries with empty notes; collect lines for summary when model omits summary_update
    const memoryLinesForSummary: string[] = [];
    for (const mw of output.memory_writes) {
      if (!mw.note) continue;
      await this.profile.saveFromAgent(
        userId,
        mw.memory_key,
        mw.note,
        messageId,
      );
      memoryLinesForSummary.push(`[${mw.memory_key}] ${mw.note.trim()}`);
    }

    if (output.detected_theme) {
      await this.profile.saveFromAgent(
        userId,
        'recurring_theme',
        output.detected_theme,
        messageId,
      );
      memoryLinesForSummary.push(
        `[recurring_theme] ${output.detected_theme.trim()}`,
      );
    }

    // Summary: merge explicit summary_update, else fold new memory_facts into the profile summary
    const explicitSummary = output.summary_update?.trim() || null;
    const inferredFromMemory =
      !explicitSummary && memoryLinesForSummary.length > 0
        ? memoryLinesForSummary.join('\n')
        : null;
    const summaryDelta = explicitSummary ?? inferredFromMemory;
    if (summaryDelta) {
      const merged = await this.mergeSummary(ctx.userSummary, summaryDelta);
      if (merged) {
        await this.db
          .update(usersTable)
          .set({ summary: merged })
          .where(eq(usersTable.id, userId));
      }
    }
  }

  private async resolveListId(
    userId: string,
    listName: string | null | undefined,
    createList: boolean | undefined,
  ): Promise<string | null> {
    if (!listName) return null;
    try {
      const rows = await this.db
        .select({ id: listsTable.id, name: listsTable.name })
        .from(listsTable)
        .where(eq(listsTable.userId, userId));

      const match = rows.find(
        (r) => r.name.toLowerCase() === listName.toLowerCase(),
      );
      if (match) return match.id;

      if (createList) {
        const [created] = await this.db
          .insert(listsTable)
          .values({ userId, name: listName.trim() })
          .returning({ id: listsTable.id });
        if (created) return created.id;
      }
    } catch {
      /* lists table may not exist yet */
    }
    return null;
  }

  private async insertExtract(
    userId: string,
    messageId: string,
    item: ExtractAction,
    tz: string | null,
  ): Promise<ExtractRow | null> {
    const now = new Date();
    const dueAt = parseIsoDate(item.due_at);
    let pStart = parseIsoDate(item.period_start);
    const pEnd = parseIsoDate(item.period_end);

    if (pStart && pStart < now) pStart = now;

    const tzPending =
      !tz && (!!item.due_at?.trim() || !!item.period_start?.trim());

    const listId = await this.resolveListId(
      userId,
      item.list_name,
      item.create_list,
    );

    const timeAnchor = dueAt ?? pStart;
    const hasSpecificTime =
      timeAnchor &&
      !(
        (timeAnchor.getHours() === 0 && timeAnchor.getMinutes() === 0) ||
        (timeAnchor.getHours() === 23 && timeAnchor.getMinutes() === 59)
      );
    const defaultReminderAt =
      hasSpecificTime && timeAnchor
        ? new Date(timeAnchor.getTime() - 60 * 60 * 1000)
        : null;

    const periodLabel = reconcileRelativePeriodLabel(
      item.period_label ?? null,
      pStart,
      tz,
    );

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
        listId,
        priority: item.priority,
        dueAt,
        periodStart: pStart,
        periodEnd: pEnd,
        periodLabel,
        timezonePending: tzPending,
        reminderAt: defaultReminderAt,
        pemNote: item.pem_note?.trim() || null,
        updatedAt: new Date(),
      })
      .returning();

    return row ?? null;
  }

  private async savePemResponse(
    userId: string,
    parentMessageId: string,
    responseText: string,
    metadata?: Record<string, unknown>,
  ): Promise<{ id: string }> {
    const [pemMsg] = await this.db
      .insert(messagesTable)
      .values({
        userId,
        role: 'pem',
        kind: 'text',
        content: responseText,
        parentMessageId,
        metadata: metadata ?? null,
      })
      .returning();

    await this.db
      .update(messagesTable)
      .set({ processingStatus: 'done' })
      .where(eq(messagesTable.id, parentMessageId));

    void this.embeddings
      .embedChatMessageIfAbsent({
        messageId: pemMsg.id,
        userId,
        role: 'pem',
        text: responseText,
        createdAt: pemMsg.createdAt,
      })
      .catch((e) =>
        this.log.warn(
          logWithContext('Pem reply embed failed', {
            userId,
            parentMessageId,
            pemMessageId: pemMsg.id,
            scope: 'chat_orchestrator',
            err: e instanceof Error ? e.message : String(e),
          }),
        ),
      );

    await this.chatEvents.publish(userId, 'pem_message', {
      message: {
        id: pemMsg.id,
        role: pemMsg.role,
        kind: pemMsg.kind,
        content: pemMsg.content,
        metadata: metadata ?? null,
        parent_message_id: pemMsg.parentMessageId,
        created_at: pemMsg.createdAt.toISOString(),
      },
    });

    await this.push.notifyChatReply(userId);
    return { id: pemMsg.id };
  }

  private async publishStatus(userId: string, messageId: string, text: string) {
    await this.chatEvents.publish(userId, 'status', { messageId, text });
  }

  /**
   * Fire-and-forget lightweight memory extraction for trivial/off_topic messages.
   * Checks if the user casually mentioned a durable fact worth saving.
   */
  private tryLightweightMemoryExtraction(
    userId: string,
    messageId: string,
    content: string,
  ): void {
    if (content.trim().length < 15) return;

    void (async () => {
      try {
        const apiKey = this.config.get<string>('openai.apiKey');
        if (!apiKey) return;

        const text = await this.orchestratorLlm.extractLightweightMemoryJson(
          content.slice(0, 500),
        );

        const trimmed = text?.trim();
        if (!trimmed || trimmed === '[]') return;

        let raw: unknown;
        try {
          raw = JSON.parse(trimmed) as unknown;
        } catch {
          return;
        }
        if (!Array.isArray(raw) || raw.length === 0) return;

        const savedLines: string[] = [];
        for (const item of raw.slice(0, 3)) {
          if (
            item &&
            typeof item === 'object' &&
            'memory_key' in item &&
            'note' in item &&
            typeof (item as { memory_key: unknown }).memory_key === 'string' &&
            typeof (item as { note: unknown }).note === 'string'
          ) {
            const f = item as { memory_key: string; note: string };
            if (f.memory_key && f.note) {
              await this.profile.saveFromAgent(
                userId,
                f.memory_key,
                f.note,
                messageId,
              );
              savedLines.push(`[${f.memory_key}] ${f.note.trim()}`);
            }
          }
        }

        if (savedLines.length > 0) {
          const [u] = await this.db
            .select({ summary: usersTable.summary })
            .from(usersTable)
            .where(eq(usersTable.id, userId))
            .limit(1);
          const merged = await this.mergeSummary(
            u?.summary ?? null,
            savedLines.join('\n'),
          );
          if (merged) {
            await this.db
              .update(usersTable)
              .set({ summary: merged })
              .where(eq(usersTable.id, userId));
          }
        }
      } catch (e) {
        this.log.warn(
          logWithContext('Lightweight memory extraction failed', {
            userId,
            messageId,
            scope: 'chat_orchestrator',
            err: e instanceof Error ? e.message : String(e),
          }),
        );
      }
    })();
  }

  /**
   * OpenAI moderation endpoint — free, ~100ms. Returns true if content is flagged.
   * Fails open (returns false) on error so we never block legitimate messages.
   */
  private async checkModeration(content: string): Promise<boolean> {
    try {
      const apiKey = this.config.get<string>('openai.apiKey');
      if (!apiKey) return false;

      const res = await fetch('https://api.openai.com/v1/moderations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ input: content.slice(0, 4000) }),
      });

      if (!res.ok) return false;

      const data = (await res.json()) as {
        results: { flagged: boolean; categories: Record<string, boolean> }[];
      };
      const result = data.results?.[0];
      if (!result?.flagged) return false;

      const flaggedCategories = Object.entries(result.categories)
        .filter(([, v]) => v)
        .map(([k]) => k);

      this.log.warn(
        logWithContext('Content moderation flagged', {
          scope: 'chat_orchestrator',
          categories: flaggedCategories.join(','),
        }),
      );
      return true;
    } catch (e) {
      this.log.warn(
        logWithContext('Moderation check failed (allowing through)', {
          scope: 'chat_orchestrator',
          err: e instanceof Error ? e.message : String(e),
        }),
      );
      return false;
    }
  }

  private trivialResponse(content: string): string {
    const lower = content.toLowerCase().trim();
    if (lower.includes('thank') || lower.includes('thx')) return 'Anytime.';
    return 'Got it.';
  }

  private async generateOffTopicRedirect(userMessage: string): Promise<string> {
    const fallback =
      "I don't have access to that kind of info, but if there's something you need to remember or plan around it, I'm here.";
    try {
      const apiKey = this.config.get<string>('openai.apiKey');
      if (!apiKey) return fallback;
      const text = await this.orchestratorLlm.generateOffTopicRedirectText(
        userMessage.slice(0, 500),
      );
      return text?.trim() || fallback;
    } catch (e) {
      this.log.warn(
        logWithContext('Off-topic redirect LLM failed', {
          scope: 'chat_orchestrator',
          err: e instanceof Error ? e.message : String(e),
        }),
      );
      return fallback;
    }
  }

  /**
   * Merge new info into the existing user summary without losing old facts.
   * If no existing summary, the new info becomes the seed.
   */
  private async mergeSummary(
    existing: string | null,
    newInfo: string,
  ): Promise<string | null> {
    const trimmed = newInfo.trim();
    if (!trimmed) return null;

    if (!existing?.trim()) return trimmed;

    try {
      const apiKey = this.config.get<string>('openai.apiKey');
      if (!apiKey) {
        return `${existing}\n\n[Update]: ${trimmed}`.slice(0, 3000);
      }

      let result =
        (await this.orchestratorLlm.mergeUserSummaryWithNewInfo(
          existing,
          trimmed,
        )) || existing;

      if (result && result.length > 2000) {
        try {
          result =
            (
              await this.orchestratorLlm.compressProfileSummary(result)
            ).trim() || result;
        } catch {
          /* compression failed — keep the original */
        }
      }

      return result ? result.slice(0, 3000) : existing;
    } catch (e) {
      this.log.warn(
        logWithContext('Summary merge failed, appending raw', {
          scope: 'chat_orchestrator',
          err: e instanceof Error ? e.message : 'unknown',
        }),
      );
      return `${existing}\n\n[Update]: ${trimmed}`.slice(0, 3000);
    }
  }

  private async seedSummaryIfReady(userId: string): Promise<void> {
    const MIN_MESSAGES = 3;

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesTable)
      .where(
        and(eq(messagesTable.userId, userId), eq(messagesTable.role, 'user')),
      );

    if (Number(count) < MIN_MESSAGES) return;

    const recentMsgs = await this.db
      .select({
        content: messagesTable.content,
        transcript: messagesTable.transcript,
      })
      .from(messagesTable)
      .where(
        and(eq(messagesTable.userId, userId), eq(messagesTable.role, 'user')),
      )
      .orderBy(desc(messagesTable.createdAt))
      .limit(15);

    const msgTexts = recentMsgs
      .map((m) => m.transcript ?? m.content ?? '')
      .filter(Boolean)
      .join('\n---\n');

    if (!msgTexts.trim()) return;

    const [userRow] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (userRow?.summary) return;

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return;

    const text =
      await this.orchestratorLlm.seedUserSummaryFromMessages(msgTexts);

    if (text.trim()) {
      await this.db
        .update(usersTable)
        .set({ summary: text.trim() })
        .where(and(eq(usersTable.id, userId), sql`summary IS NULL`));
      this.log.log(
        logWithContext('Seeded initial summary for user', {
          userId,
          scope: 'chat_orchestrator',
        }),
      );
    }
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
