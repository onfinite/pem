import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { and, eq, gte, inArray, isNotNull, desc, sql } from 'drizzle-orm';

import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import {
  extractsTable,
  messagesTable,
  type ExtractRow,
} from '../../../database/schemas';
import { EmbeddingsService } from '../../../embeddings/embeddings.service';
import {
  ExtractsService,
  type BriefBuckets,
} from '../../../extracts/extracts.service';
import { ProfileService } from '../../../profile/profile.service';
import {
  RAG_MIN_SIMILARITY,
  RAG_TOP_K,
  DONE_EXTRACTS_LOOKBACK_DAYS,
  DISMISSED_EXTRACTS_LOOKBACK_DAYS,
} from '../../../chat/chat.constants';

const QUESTION_RECENT_MESSAGES_LIMIT = 15;

function formatBuckets(b: BriefBuckets): string {
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

function formatAllOpen(rows: ExtractRow[]): string {
  if (!rows.length) return 'No open tasks.';
  return rows
    .map((r) => {
      const parts = [r.extractText];
      if (r.batchKey) parts.push(`[${r.batchKey}]`);
      if (r.urgency === 'someday') parts.push('someday');
      if (r.tone) parts.push(`tone: ${r.tone}`);
      if (r.dueAt) parts.push(`due: ${r.dueAt.toISOString()}`);
      if (r.eventStartAt)
        parts.push(`event: ${r.eventStartAt.toISOString()}`);
      if (r.periodLabel) parts.push(`period: ${r.periodLabel}`);
      if (r.periodStart)
        parts.push(`from: ${r.periodStart.toISOString()}`);
      if (r.periodEnd) parts.push(`to: ${r.periodEnd.toISOString()}`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');
}

@Injectable()
export class ChatQuestionService {
  private readonly log = new Logger(ChatQuestionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
    private readonly extracts: ExtractsService,
    private readonly profile: ProfileService,
  ) {}

  async answer(
    userId: string,
    question: string,
    userName?: string | null,
    userSummary?: string | null,
  ): Promise<string> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      return "I can't look that up right now — try again in a moment.";
    }

    try {
      const now = new Date();
      const doneSince = new Date(now);
      doneSince.setUTCDate(doneSince.getUTCDate() - DONE_EXTRACTS_LOOKBACK_DAYS);
      const dismissedSince = new Date(now);
      dismissedSince.setUTCDate(
        dismissedSince.getUTCDate() - DISMISSED_EXTRACTS_LOOKBACK_DAYS,
      );

      const [
        allOpen,
        buckets,
        ragHits,
        memorySection,
        recentMsgs,
        doneRows,
        dismissedRows,
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
          question,
          RAG_TOP_K,
          RAG_MIN_SIMILARITY,
        ),
        this.profile.buildMemoryPromptSection(userId),
        this.db
          .select({
            role: messagesTable.role,
            content: messagesTable.content,
            transcript: messagesTable.transcript,
            createdAt: messagesTable.createdAt,
          })
          .from(messagesTable)
          .where(eq(messagesTable.userId, userId))
          .orderBy(sql`${messagesTable.createdAt} DESC`)
          .limit(QUESTION_RECENT_MESSAGES_LIMIT),
        this.db
          .select()
          .from(extractsTable)
          .where(
            and(
              eq(extractsTable.userId, userId),
              eq(extractsTable.status, 'done'),
              isNotNull(extractsTable.doneAt),
              gte(extractsTable.doneAt, doneSince),
            ),
          )
          .orderBy(desc(extractsTable.doneAt))
          .limit(80),
        this.db
          .select()
          .from(extractsTable)
          .where(
            and(
              eq(extractsTable.userId, userId),
              eq(extractsTable.status, 'dismissed'),
              isNotNull(extractsTable.dismissedAt),
              gte(extractsTable.dismissedAt, dismissedSince),
            ),
          )
          .orderBy(desc(extractsTable.dismissedAt))
          .limit(40),
      ]);

      const allOpenBlock = formatAllOpen(allOpen);
      const timelineBlock = formatBuckets(buckets);

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
                const text = m.transcript ?? m.content ?? '';
                return `- ${m.role}: ${text.slice(0, 300)}`;
              })
              .join('\n')}`
          : '';

      const doneBlock =
        doneRows.length > 0
          ? `Recently completed:\n${doneRows
              .map((r) => {
                const when = r.doneAt
                  ? r.doneAt.toISOString().slice(0, 10)
                  : '';
                return `- ${r.extractText}${when ? ` (done ${when})` : ''}`;
              })
              .join('\n')}`
          : '';

      const dismissedBlock =
        dismissedRows.length > 0
          ? `Recently dismissed:\n${dismissedRows
              .map((r) => `- ${r.extractText}`)
              .join('\n')}`
          : '';

      const openai = createOpenAI({ apiKey });

      const nameNote = userName ? ` The user's name is ${userName}.` : '';
      const summaryBlock = userSummary
        ? `\nAbout the user:\n${userSummary}\n\n`
        : '';

      const { text } = await generateText({
        model: openai('gpt-4o'),
        maxRetries: 2,
        system: `You are Pem — a friend who remembers everything.${nameNote} Answer using the context below (tasks, completed items, memory, past messages, conversation history). If the context doesn't contain the answer, be honest: "I don't have anything about that yet. Tell me and I'll remember." Never invent facts.

Recall questions ("do you remember X?", "what were we talking about last month?", "what do you know about Z?", "who is X?"):
- Piece together everything from memory, user summary, past messages, and completed tasks.
- For time-based recall ("last month", "last week", "recently"), look at message dates and task creation dates in the context.
- If you have partial info, share what you have and note what you're unsure about.
- If you truly have nothing: "I don't have anything about that yet. Tell me and I'll remember for next time."

Briefs and overviews (today, tomorrow, next week, etc.): Give a short narrative — what matters most first, what's on calendar, what's on lists. Prioritize by dates. When a month/quarter is starting, mention items with matching period labels. This path is read-only — don't say you're adding tasks.

Prioritization ("what should I focus on", "top tasks", "most important"): Rank by (1) overdue, (2) aligned with goals/aspirations from memory, (3) due today, (4) quick wins.

Completion checks ("did I already do X?"): Check the recently completed section first, then open tasks.

Tone: Be warm and natural. Talk like a friend who knows them well. No markdown, no bullet points. Use natural prose.`,
        prompt: `${summaryBlock}${memorySection ? `Memory:\n${memorySection}\n\n` : ''}All open tasks:\n${allOpenBlock}\n\n${timelineBlock ? `Timeline view:\n${timelineBlock}\n\n` : ''}${doneBlock ? `${doneBlock}\n\n` : ''}${dismissedBlock ? `${dismissedBlock}\n\n` : ''}${ragBlock ? `${ragBlock}\n\n` : ''}${recentChatBlock ? `${recentChatBlock}\n\n` : ''}Question:\n"""${question.slice(0, 4000)}"""`,
      });

      return (
        text.trim() ||
        "I don't have enough in your Pem data to answer that yet."
      );
    } catch (e) {
      this.log.warn(
        `Chat question failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return "I couldn't answer that just now. Could you try again?";
    }
  }
}
