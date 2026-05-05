import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gte, lte, inArray, isNotNull, desc, sql } from 'drizzle-orm';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  extractsTable,
  messagesTable,
  usersTable,
  type ExtractRow,
} from '@/database/schemas/index';
import { formatChatRecallStamp } from '@/modules/agent/helpers/format-chat-recall-stamp';
import {
  asksAboutCompletedTasks,
  detectQuestionTemporalRange,
  wantsAllTimeCompletedTasks,
} from '@/modules/agent/question/helpers/chat-question-temporal';
import { EmbeddingsService } from '@/modules/memory/embeddings.service';
import {
  ExtractsService,
  type BriefBuckets,
} from '@/modules/extracts/services/extracts.service';
import { visionLineForHumans } from '@/modules/media/photo/helpers/photo-vision-stored';
import { ProfileService } from '@/modules/profile/profile.service';
import { StorageService } from '@/modules/storage/storage.service';
import { buildPhotoRecallMetadata } from '@/modules/media/photo/helpers/build-photo-recall-metadata';
import { buildPhotoRecallPromptSection } from '@/modules/media/photo/helpers/build-photo-recall-prompt-section';
import { ChatPhotoRecallIntentService } from '@/modules/media/photo/chat-photo-recall-intent.service';
import { orderedMessageIdsFromRecallItems } from '@/modules/media/photo/helpers/resolve-photo-recall-message-ids';
import { buildSavedLinksRecallPromptSection } from '@/modules/agent/question/helpers/saved-links-recall-for-ask';
import {
  ASK_DONE_EXTRACTS_CAP,
  DONE_EXTRACTS_LOOKBACK_DAYS,
  RAG_ENRICHMENT_MERGE_TRIGGER_MAX,
  RAG_ENRICHMENT_MIN_SIMILARITY,
  RAG_ENRICHMENT_TOP_K,
} from '@/modules/chat/constants/chat.constants';
import {
  buildAgentRagSearchParams,
  isBroadTopicRecallQuery,
  isLooseRecallQuery,
  mergeRagHitsByMessageId,
  RAG_MIN_SIMILARITY_BROAD_TOPIC_RECALL_FALLBACK,
} from '@/modules/chat/helpers/chat-rag-recall-params';
import { logWithContext } from '@/core/utils/format-log-context';
import { ChatQuestionLlmService } from '@/modules/agent/question/chat-question-llm.service';
import { RecallQueryPlannerLlmService } from '@/modules/agent/question/helpers/recall-query-planner-llm.service';
import { buildTemporalMessagesRecallBlock } from '@/modules/agent/question/helpers/build-temporal-messages-recall-block';

@Injectable()
export class ChatQuestionService {
  private static readonly questionRecentMessagesLimit = 15;

  /** Enough vision text for multi-photo messages in Ask / question_only. */
  private static readonly questionImageVisionCharLimit = 6000;

  private readonly log = new Logger(ChatQuestionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
    private readonly extracts: ExtractsService,
    private readonly profile: ProfileService,
    private readonly storage: StorageService,
    private readonly photoRecallIntent: ChatPhotoRecallIntentService,
    private readonly questionLlm: ChatQuestionLlmService,
    private readonly recallPlanner: RecallQueryPlannerLlmService,
  ) {}

  async answer(
    userId: string,
    question: string,
    userName?: string | null,
    userSummary?: string | null,
    linkContextSection?: string | null,
  ): Promise<{ text: string; metadata?: Record<string, unknown> }> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      return {
        text: "I can't look that up right now — try again in a moment.",
      };
    }

    try {
      const now = new Date();
      const closedSince = new Date(now);
      closedSince.setUTCDate(
        closedSince.getUTCDate() - DONE_EXTRACTS_LOOKBACK_DAYS,
      );

      const [userTzRow] = await this.db
        .select({ timezone: usersTable.timezone })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      const userTimeZone = userTzRow?.timezone ?? null;
      const temporalRange = detectQuestionTemporalRange(
        question,
        now,
        userTimeZone,
      );
      const asksDoneHints = asksAboutCompletedTasks(question);
      const allTimeDone = wantsAllTimeCompletedTasks(question);
      const scopeDoneToTemporal = Boolean(temporalRange && asksDoneHints);

      const closedWhereParts = [
        eq(extractsTable.userId, userId),
        eq(extractsTable.status, 'closed'),
        isNotNull(extractsTable.closedAt),
      ];
      if (temporalRange && asksDoneHints) {
        closedWhereParts.push(gte(extractsTable.closedAt, temporalRange.start));
        closedWhereParts.push(lte(extractsTable.closedAt, temporalRange.end));
      } else if (!allTimeDone) {
        closedWhereParts.push(gte(extractsTable.closedAt, closedSince));
      }
      const ragSimilarityOpts = temporalRange
        ? {
            temporalBoost: {
              start: temporalRange.start,
              end: temporalRange.end,
            },
          }
        : undefined;

      let recallPlan: Awaited<
        ReturnType<RecallQueryPlannerLlmService['plan']>
      > = null;
      if (this.recallPlanner.shouldPlan(question)) {
        recallPlan = await this.recallPlanner.plan(question);
      }
      let ragQueryText = question;
      if (
        recallPlan &&
        (recallPlan.recall_kind === 'episodic_topic' ||
          recallPlan.recall_kind === 'mixed')
      ) {
        const q = recallPlan.embedding_search_text?.trim();
        if (q) ragQueryText = q;
      }

      const ragUsesLooseRecallFloor =
        isBroadTopicRecallQuery(ragQueryText) ||
        isLooseRecallQuery(ragQueryText);

      const ragSearch = buildAgentRagSearchParams(ragQueryText, temporalRange);
      const ragVectorQuery = ragSearch.vectorQuery;

      const [
        allOpen,
        buckets,
        ragHitsInitial,
        memorySection,
        recentMsgs,
        closedRows,
      ] = await Promise.all([
        this.db
          .select()
          .from(extractsTable)
          .where(
            and(
              eq(extractsTable.userId, userId),
              inArray(extractsTable.status, ['inbox', 'snoozed']),
            ),
          )
          .orderBy(desc(extractsTable.createdAt))
          .limit(100),
        this.extracts.getAskOpenTimelineBuckets(userId),
        this.embeddings.similaritySearch(
          userId,
          ragSearch.vectorQuery,
          ragSearch.topK,
          ragSearch.minSimilarity,
          ragSimilarityOpts,
        ),
        this.profile.buildMemoryPromptSection(userId),
        this.db
          .select({
            id: messagesTable.id,
            role: messagesTable.role,
            kind: messagesTable.kind,
            content: messagesTable.content,
            transcript: messagesTable.transcript,
            visionSummary: messagesTable.visionSummary,
            createdAt: messagesTable.createdAt,
          })
          .from(messagesTable)
          .where(eq(messagesTable.userId, userId))
          .orderBy(sql`${messagesTable.createdAt} DESC`)
          .limit(ChatQuestionService.questionRecentMessagesLimit),
        this.db
          .select()
          .from(extractsTable)
          .where(and(...closedWhereParts))
          .orderBy(desc(extractsTable.closedAt))
          .limit(ASK_DONE_EXTRACTS_CAP),
      ]);

      let ragHits = ragHitsInitial;
      if (
        ragHits.length < RAG_ENRICHMENT_MERGE_TRIGGER_MAX &&
        !ragUsesLooseRecallFloor
      ) {
        const enrich = await this.embeddings.similaritySearch(
          userId,
          ragSearch.vectorQuery,
          RAG_ENRICHMENT_TOP_K,
          RAG_ENRICHMENT_MIN_SIMILARITY,
          ragSimilarityOpts,
        );
        ragHits = mergeRagHitsByMessageId(ragHits, enrich);
      }
      if (ragHits.length === 0 && ragUsesLooseRecallFloor) {
        ragHits = await this.embeddings.similaritySearch(
          userId,
          ragSearch.vectorQuery,
          Math.max(ragSearch.topK, 32),
          RAG_MIN_SIMILARITY_BROAD_TOPIC_RECALL_FALLBACK,
          ragSimilarityOpts,
        );
      }

      const allOpenBlock = this.formatAllOpen(allOpen);
      const timelineBlock = this.formatBuckets(buckets);

      const photoRecallUserText =
        recallPlan?.wants_past_photos &&
        recallPlan.embedding_search_text?.trim()
          ? `${recallPlan.embedding_search_text.trim()}\n\n${question}`
          : question;

      const { attachStrip, messageIds: photoRecallMessageIds } =
        await this.photoRecallIntent.resolveStripAndMessageIds({
          userId,
          userText: photoRecallUserText,
          vectorQueryText: ragVectorQuery,
          ragMessageIds: ragHits.map((h) => h.messageId),
          vectorSearchOpts: ragSimilarityOpts,
        });
      let photoRecall: Awaited<ReturnType<typeof buildPhotoRecallMetadata>>;
      if (attachStrip && photoRecallMessageIds.length > 0) {
        photoRecall = await buildPhotoRecallMetadata(
          this.db,
          this.storage,
          userId,
          photoRecallMessageIds,
        );
      } else {
        photoRecall = undefined;
      }

      const idsForPhotoRecallPrompt = photoRecall?.photo_recall?.length
        ? orderedMessageIdsFromRecallItems(photoRecall.photo_recall)
        : photoRecallMessageIds;

      const photoRecallPromptBlock =
        idsForPhotoRecallPrompt.length > 0
          ? await buildPhotoRecallPromptSection(
              this.db,
              userId,
              idsForPhotoRecallPrompt,
              now,
              userTimeZone,
            )
          : undefined;

      const ragBlock =
        ragHits.length > 0
          ? `Related past messages (by similarity):\n${ragHits
              .map((h) => `- ${h.content}`)
              .join('\n')}`
          : '';

      const recentChatBlock =
        recentMsgs.length > 0
          ? `Recent conversation:\n${recentMsgs
              .reverse()
              .map((m) => {
                const text = this.lineForQuestionRecent(m);
                const stamp = formatChatRecallStamp(
                  m.createdAt,
                  now,
                  userTimeZone,
                );
                return `- [${stamp}] ${m.role}: ${text}`;
              })
              .join('\n')}`
          : '';

      const closedTruncated =
        closedRows.length >= ASK_DONE_EXTRACTS_CAP &&
        (allTimeDone || scopeDoneToTemporal);
      const closedCapNote = closedTruncated
        ? `Note: At most ${ASK_DONE_EXTRACTS_CAP} closed tasks are listed${temporalRange && asksDoneHints ? ` for ${temporalRange.label}` : ''}; there may be more. Summarize what you see and offer to narrow the timeframe if useful.\n\n`
        : '';

      let closedHeading = 'Recently closed';
      if (temporalRange && asksDoneHints) {
        closedHeading = `Closed (${temporalRange.label})`;
      } else if (allTimeDone) {
        closedHeading = 'Most recently closed (sample)';
      }

      const closedBlock =
        closedRows.length > 0
          ? `${closedCapNote}${closedHeading}:\n${closedRows
              .map((r) => {
                const when = r.closedAt
                  ? formatChatRecallStamp(r.closedAt, now, userTimeZone)
                  : '';
                return `- ${r.extractText}${when ? ` (closed ${when})` : ''}`;
              })
              .join('\n')}`
          : '';

      let temporalBlock = '';
      if (temporalRange?.label) {
        try {
          const block = await buildTemporalMessagesRecallBlock(
            this.db,
            userId,
            temporalRange,
            now,
            userTimeZone,
          );
          if (block) temporalBlock = block;
        } catch (e) {
          this.log.warn(
            logWithContext('Ask temporal query block failed', {
              userId,
              scope: 'chat_question',
              err: e instanceof Error ? e.message : 'unknown',
            }),
          );
        }
      }

      const nameNote = userName ? ` The user's name is ${userName}.` : '';
      const summaryBlock = userSummary
        ? `\nAbout the user:\n${userSummary}\n\n`
        : '';

      const savedLinksRecallSection = await buildSavedLinksRecallPromptSection(
        this.db,
        userId,
        question,
        now,
        userTimeZone,
      );

      const text = await this.questionLlm.generateAnswerText({
        system: this.questionLlm.buildAskQuestionSystemPrompt(nameNote),
        prompt: `${summaryBlock}${memorySection ? `Memory:\n${memorySection}\n\n` : ''}All open tasks:\n${allOpenBlock}\n\n${timelineBlock ? `Timeline view:\n${timelineBlock}\n\n` : ''}${closedBlock ? `${closedBlock}\n\n` : ''}${ragBlock ? `${ragBlock}\n\n` : ''}${photoRecallPromptBlock ? `${photoRecallPromptBlock}\n\n` : ''}${temporalBlock ? `${temporalBlock}\n\n` : ''}${recentChatBlock ? `${recentChatBlock}\n\n` : ''}${savedLinksRecallSection ? `${savedLinksRecallSection}\n\n` : ''}${linkContextSection ? `${linkContextSection}\n\n` : ''}Question:\n"""${question.slice(0, 4000)}"""`,
      });

      const trimmed =
        text.trim() ||
        "I don't have enough in your Pem data to answer that yet.";
      const metadata = photoRecall?.photo_recall?.length
        ? { ...photoRecall }
        : undefined;
      return { text: trimmed, metadata };
    } catch (e) {
      this.log.warn(
        logWithContext('Chat question failed', {
          userId,
          scope: 'chat_question',
          err: e instanceof Error ? e.message : 'unknown',
        }),
      );
      return {
        text: "I couldn't answer that just now. Could you try again?",
      };
    }
  }

  private formatBuckets(b: BriefBuckets): string {
    const lines: string[] = [];
    const push = (title: string, rows: { extractText: string }[]) => {
      if (!rows.length) return;
      lines.push(
        `${title}:\n${rows.map((r) => `- ${r.extractText}`).join('\n')}`,
      );
    };
    push('Overdue', b.overdue);
    push('Today', b.today);
    push('Tomorrow', b.tomorrow);
    push('This week', b.this_week);
    push('Next week', b.next_week);
    push('Later', b.later);
    if (b.batch_counts.length) {
      lines.push(
        `Batch counts: ${b.batch_counts.map((c) => `${c.batch_key}=${c.count}`).join(', ')}`,
      );
    }
    return lines.join('\n\n') || '';
  }

  private lineForQuestionRecent(m: {
    role: string;
    content: string | null;
    transcript: string | null;
    kind: string | null;
    visionSummary: string | null;
  }): string {
    if (m.role === 'pem') return m.content ?? '';
    if (m.kind === 'image') {
      const cap = (m.content ?? '').trim();
      const vis = visionLineForHumans(m.visionSummary ?? '');
      const capLimit = ChatQuestionService.questionImageVisionCharLimit;
      const visOut = vis.length > capLimit ? `${vis.slice(0, capLimit)}…` : vis;
      const capOut = cap.slice(0, 800);
      if (cap && vis) return `${capOut}\n[Photo: ${visOut}]`;
      if (vis) return `[Photo: ${visOut}]`;
      if (cap) return `${capOut} [photo]`;
      return '[photo]';
    }
    return (m.transcript ?? m.content ?? '').slice(0, 600);
  }

  private formatAllOpen(rows: ExtractRow[]): string {
    if (!rows.length) return 'No open tasks.';
    return rows
      .map((r) => {
        const parts = [r.extractText];
        if (r.batchKey) parts.push(`[${r.batchKey}]`);
        if (r.urgency === 'holding') parts.push('holding');
        if (r.tone) parts.push(`tone: ${r.tone}`);
        if (r.dueAt) parts.push(`due: ${r.dueAt.toISOString()}`);
        if (r.eventStartAt)
          parts.push(`event: ${r.eventStartAt.toISOString()}`);
        if (r.periodLabel) parts.push(`period: ${r.periodLabel}`);
        if (r.periodStart) parts.push(`from: ${r.periodStart.toISOString()}`);
        if (r.periodEnd) parts.push(`to: ${r.periodEnd.toISOString()}`);
        return `- ${parts.join(' | ')}`;
      })
      .join('\n');
  }
}
