import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { and, eq, inArray, desc, sql } from 'drizzle-orm';

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
import { RAG_MIN_SIMILARITY, RAG_TOP_K } from '../../../chat/chat.constants';

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
      const [allOpen, buckets, ragHits, memorySection, recentMsgs] =
        await Promise.all([
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

      const openai = createOpenAI({ apiKey });

      const nameNote = userName ? ` The user's name is ${userName}.` : '';
      const summaryBlock = userSummary
        ? `\nAbout the user:\n${userSummary}\n\n`
        : '';

      const { text } = await generateText({
        model: openai('gpt-4o'),
        maxRetries: 2,
        system: `You are Pem.${nameNote} The user asked a question about THEIR own data in Pem. Answer using ONLY the context below (open tasks, timeline, memory, related past messages). If the context does not contain the answer, say you don't have that in Pem yet — do not invent facts.

Never answer weather, news, sports, homework, or other general-knowledge questions from this path (those should not reach you). If the question is clearly not about their tasks, calendar, or what they told Pem, say you're only set up to help with what they've saved in Pem.

If they asked for a "brief" or overview (today, tomorrow, next week, next month, or similar), give a short narrative: what matters first, what's on the calendar, what's on their lists — prioritize by dates in the data. When a month or quarter is starting, proactively mention items with period labels like "June", "Q3", "this month" so the user remembers to schedule them. Do not tell them you are "adding tasks"; this path is read-only. If a time range has little in the data, say so plainly.

If they ask "what should I focus on", "top N tasks", "most important", or any prioritization question, rank by: (1) overdue items first, (2) items aligned with their goals/aspirations from memory, (3) items due today, (4) quick wins. Explain briefly why each item ranks where it does.

Be warm and concise — no markdown. For lists, use natural prose (e.g. "You have: milk, onions, and tomatoes on your shopping list" or "In your ideas: starting a podcast, the fitness app concept").`,
        prompt: `${summaryBlock}${memorySection ? `Memory:\n${memorySection}\n\n` : ''}All open tasks:\n${allOpenBlock}\n\n${timelineBlock ? `Timeline view:\n${timelineBlock}\n\n` : ''}${ragBlock ? `${ragBlock}\n\n` : ''}${recentChatBlock ? `${recentChatBlock}\n\n` : ''}Question:\n"""${question.slice(0, 4000)}"""`,
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
