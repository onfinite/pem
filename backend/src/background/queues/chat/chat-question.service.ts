import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { and, eq, gte, lte, inArray, isNotNull, desc, sql } from 'drizzle-orm';

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

const TEMPORAL_PATTERNS: { regex: RegExp; resolver: (now: Date) => { start: Date; end: Date; label: string } }[] = [
  {
    regex: /\b(?:this time|this day|around now)\s+last year\b/i,
    resolver: (now) => {
      const start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() - 7);
      const end = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate() + 7);
      return { start, end, label: `around ${end.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} last year` };
    },
  },
  {
    regex: /\blast\s+year\b/i,
    resolver: (now) => ({
      start: new Date(now.getFullYear() - 1, 0, 1),
      end: new Date(now.getFullYear() - 1, 11, 31),
      label: String(now.getFullYear() - 1),
    }),
  },
  {
    regex: /\blast\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    resolver: (now) => {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const match = /\blast\s+(\w+)\b/i.exec('');
      const monthName = RegExp.$1.toLowerCase();
      const monthIdx = months.indexOf(monthName);
      if (monthIdx < 0) return { start: now, end: now, label: '' };
      const year = monthIdx >= now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      return {
        start: new Date(year, monthIdx, 1),
        end: new Date(year, monthIdx + 1, 0),
        label: `${months[monthIdx]} ${year}`,
      };
    },
  },
  {
    regex: /\bin\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/i,
    resolver: (now) => {
      const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
      const monthName = RegExp.$1.toLowerCase();
      const monthIdx = months.indexOf(monthName);
      if (monthIdx < 0) return { start: now, end: now, label: '' };
      const year = monthIdx >= now.getMonth() ? now.getFullYear() - 1 : now.getFullYear();
      return {
        start: new Date(year, monthIdx, 1),
        end: new Date(year, monthIdx + 1, 0),
        label: `${months[monthIdx]} ${year}`,
      };
    },
  },
  {
    regex: /\b(\d+)\s+months?\s+ago\b/i,
    resolver: (now) => {
      const n = parseInt(RegExp.$1, 10);
      const start = new Date(now.getFullYear(), now.getMonth() - n, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - n + 1, 0);
      return { start, end, label: `${n} month${n > 1 ? 's' : ''} ago` };
    },
  },
  {
    regex: /\blast\s+month\b/i,
    resolver: (now) => ({
      start: new Date(now.getFullYear(), now.getMonth() - 1, 1),
      end: new Date(now.getFullYear(), now.getMonth(), 0),
      label: 'last month',
    }),
  },
  {
    regex: /\blast\s+week\b/i,
    resolver: (now) => ({
      start: new Date(now.getTime() - 14 * 86_400_000),
      end: new Date(now.getTime() - 7 * 86_400_000),
      label: 'last week',
    }),
  },
  {
    regex: /\blast\s+summer\b/i,
    resolver: (now) => {
      const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
      return { start: new Date(year, 5, 1), end: new Date(year, 8, 0), label: `summer ${year}` };
    },
  },
];

function detectTemporalRange(question: string, now: Date): { start: Date; end: Date; label: string } | null {
  for (const { regex, resolver } of TEMPORAL_PATTERNS) {
    if (regex.test(question)) return resolver(now);
  }
  return null;
}

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

      let temporalBlock = '';
      const temporalRange = detectTemporalRange(question, now);
      if (temporalRange && temporalRange.label) {
        try {
          const historicalMsgs = await this.db
            .select({
              role: messagesTable.role,
              content: messagesTable.content,
              transcript: messagesTable.transcript,
              createdAt: messagesTable.createdAt,
            })
            .from(messagesTable)
            .where(
              and(
                eq(messagesTable.userId, userId),
                gte(messagesTable.createdAt, temporalRange.start),
                lte(messagesTable.createdAt, temporalRange.end),
              ),
            )
            .orderBy(desc(messagesTable.createdAt))
            .limit(30);

          if (historicalMsgs.length > 0) {
            temporalBlock = `Messages from ${temporalRange.label} (${historicalMsgs.length} found):\n${historicalMsgs
              .map((m) => {
                const t = m.transcript ?? m.content ?? '';
                const date = m.createdAt.toISOString().slice(0, 10);
                return `- [${date}] ${m.role}: ${t.slice(0, 300)}`;
              })
              .join('\n')}`;
          }
        } catch (e) {
          this.log.warn(
            `Temporal query failed: ${e instanceof Error ? e.message : 'unknown'}`,
          );
        }
      }

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
- For time-based recall ("last month", "last week", "recently"), look at message dates and task creation dates in the context. When a "Messages from {period}" section is present, use it as the primary source for that time range.
- If you have partial info, share what you have and note what you're unsure about.
- If you truly have nothing: "I don't have anything about that yet. Tell me and I'll remember for next time."

Temporal questions ("what was I talking about last year?", "what was my vibe in April?", "what was on my mind last summer?"):
- Use the "Messages from {period}" section below as your primary source — it contains actual messages from that time.
- Synthesize themes and patterns from those messages. Don't list messages — describe the vibe, the worries, the themes.
- If the period has no messages, be honest: "I don't have messages from that far back yet."

Briefs and overviews (today, tomorrow, next week, etc.): Give a short narrative — what matters most first, what's on calendar, what's on lists. Prioritize by dates. When a month/quarter is starting, mention items with matching period labels. This path is read-only — don't say you're adding tasks.

Prioritization ("what should I focus on", "top tasks", "most important"): Rank by (1) overdue, (2) aligned with goals/aspirations from memory, (3) due today, (4) quick wins.

Completion checks ("did I already do X?"): Check the recently completed section first, then open tasks.

Ideas ("what ideas did I have?", "list my ideas", "any ideas about X?"): Look for memory facts with key "ideas" in the Memory section. List them clearly — these are speculative thoughts the user dumped previously. Present them as seeds, not tasks. If none found, say "You haven't shared any ideas with me yet."

Tone: Be warm and natural. Talk like a friend who knows them well. No markdown, no bullet points. Use natural prose.`,
        prompt: `${summaryBlock}${memorySection ? `Memory:\n${memorySection}\n\n` : ''}All open tasks:\n${allOpenBlock}\n\n${timelineBlock ? `Timeline view:\n${timelineBlock}\n\n` : ''}${doneBlock ? `${doneBlock}\n\n` : ''}${dismissedBlock ? `${dismissedBlock}\n\n` : ''}${ragBlock ? `${ragBlock}\n\n` : ''}${temporalBlock ? `${temporalBlock}\n\n` : ''}${recentChatBlock ? `${recentChatBlock}\n\n` : ''}Question:\n"""${question.slice(0, 4000)}"""`,
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
