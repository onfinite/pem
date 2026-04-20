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
  usersTable,
  type ExtractRow,
} from '../../../database/schemas';
import { formatChatRecallStamp } from '../../../chat/utils/format-chat-recall-stamp';
import {
  asksAboutCompletedTasks,
  buildRecallEmbeddingAugmentation,
  detectQuestionTemporalRange,
  wantsAllTimeCompletedTasks,
} from './chat-question-temporal';
import { EmbeddingsService } from '../../../embeddings/embeddings.service';
import {
  ExtractsService,
  type BriefBuckets,
} from '../../../extracts/extracts.service';
import { visionLineForHumans } from '../../../chat/utils/photo-vision-stored';
import { ProfileService } from '../../../profile/profile.service';
import { StorageService } from '../../../storage/storage.service';
import { buildPhotoRecallMetadata } from './build-photo-recall-metadata';
import { ChatPhotoRecallIntentService } from './chat-photo-recall-intent.service';
import {
  ASK_DONE_EXTRACTS_CAP,
  RAG_MIN_SIMILARITY,
  RAG_TOP_K,
  DONE_EXTRACTS_LOOKBACK_DAYS,
} from '../../../chat/chat.constants';

const QUESTION_RECENT_MESSAGES_LIMIT = 15;

/** Enough vision text for multi-photo messages in Ask / question_only. */
const QUESTION_IMAGE_VISION_CHAR_LIMIT = 6000;

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

function lineForQuestionRecent(m: {
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
    const visOut =
      vis.length > QUESTION_IMAGE_VISION_CHAR_LIMIT
        ? `${vis.slice(0, QUESTION_IMAGE_VISION_CHAR_LIMIT)}…`
        : vis;
    const capOut = cap.slice(0, 800);
    if (cap && vis) return `${capOut}\n[Photo: ${visOut}]`;
    if (vis) return `[Photo: ${visOut}]`;
    if (cap) return `${capOut} [photo]`;
    return '[photo]';
  }
  return (m.transcript ?? m.content ?? '').slice(0, 600);
}

function formatAllOpen(rows: ExtractRow[]): string {
  if (!rows.length) return 'No open tasks.';
  return rows
    .map((r) => {
      const parts = [r.extractText];
      if (r.batchKey) parts.push(`[${r.batchKey}]`);
      if (r.urgency === 'holding') parts.push('holding');
      if (r.tone) parts.push(`tone: ${r.tone}`);
      if (r.dueAt) parts.push(`due: ${r.dueAt.toISOString()}`);
      if (r.eventStartAt) parts.push(`event: ${r.eventStartAt.toISOString()}`);
      if (r.periodLabel) parts.push(`period: ${r.periodLabel}`);
      if (r.periodStart) parts.push(`from: ${r.periodStart.toISOString()}`);
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
    private readonly storage: StorageService,
    private readonly photoRecallIntent: ChatPhotoRecallIntentService,
  ) {}

  async answer(
    userId: string,
    question: string,
    userName?: string | null,
    userSummary?: string | null,
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
        closedWhereParts.push(
          gte(extractsTable.closedAt, temporalRange.start),
        );
        closedWhereParts.push(
          lte(extractsTable.closedAt, temporalRange.end),
        );
      } else if (!allTimeDone) {
        closedWhereParts.push(gte(extractsTable.closedAt, closedSince));
      }
      const ragVectorQuery = temporalRange
        ? `${question}\n\n${buildRecallEmbeddingAugmentation(temporalRange)}`
        : question;
      const ragSimilarityOpts = temporalRange
        ? {
            temporalBoost: {
              start: temporalRange.start,
              end: temporalRange.end,
            },
          }
        : undefined;

      const [
        allOpen,
        buckets,
        ragHits,
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
          ragVectorQuery,
          RAG_TOP_K,
          RAG_MIN_SIMILARITY,
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
          .limit(QUESTION_RECENT_MESSAGES_LIMIT),
        this.db
          .select()
          .from(extractsTable)
          .where(and(...closedWhereParts))
          .orderBy(desc(extractsTable.closedAt))
          .limit(ASK_DONE_EXTRACTS_CAP),
      ]);

      const allOpenBlock = formatAllOpen(allOpen);
      const timelineBlock = formatBuckets(buckets);

      const { attachStrip, messageIds: photoRecallMessageIds } =
        await this.photoRecallIntent.resolveStripAndMessageIds({
          userId,
          userText: question,
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
                const text = lineForQuestionRecent(m);
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
      if (temporalRange && temporalRange.label) {
        try {
          const historicalMsgs = await this.db
            .select({
              role: messagesTable.role,
              kind: messagesTable.kind,
              content: messagesTable.content,
              transcript: messagesTable.transcript,
              visionSummary: messagesTable.visionSummary,
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
                const text = lineForQuestionRecent({
                  role: m.role,
                  kind: m.kind,
                  content: m.content,
                  transcript: m.transcript,
                  visionSummary: m.visionSummary,
                });
                const stamp = formatChatRecallStamp(
                  m.createdAt,
                  now,
                  userTimeZone,
                );
                return `- [${stamp}] ${m.role}: ${text.slice(0, 1200)}`;
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

Recall questions ("do you remember X?", "what were we talking about last month?", "when did we discuss Y?", "what did we talk about today?", "remind me about Z", "who is X?", "what did we discuss with Farin?", "trying to remember our meeting about X"):
- Piece together everything from memory, user summary, past messages, and closed tasks.
- Always anchor memory in time and substance: say when it was (using the bracket stamps in context) and what the conversation or moment was like — themes, tone, what they cared about — not only a flat fact. If a stamp is only "today" or "yesterday", say just that — do not add a calendar date (no "April 17, 2026" or "4/17/2026" for those).
- For "when did we discuss X?", use message timestamps and RAG hits; give the clearest date phrasing you can. If the stamp includes a calendar date or "last Monday" with a date, you may echo that; never invent a numeric date when the stamp is only "today" or "yesterday".
- For time-based recall ("last month", "yesterday", "this month", "recently", or a specific calendar day like "April 12 last year" / "4/5/2007"), look at message dates and task creation dates in the context. When a "Messages from {period}" section is present, use it as the primary source for that time range.
- When the client shows a thumbnail row of past chat photos for this question, those images were chosen as relevant to what they asked — describe the same scenes in your answer; weave them into the story of what you remember.
- If you have partial info, share what you have and note what you're unsure about.
- If you truly have nothing: "I don't have anything about that yet. Tell me and I'll remember for next time."

Temporal questions ("what was I talking about last year?", "what was my vibe in April?", "what was on my mind last summer?"):
- Use the "Messages from {period}" section below as your primary source — it contains actual messages from that time.
- Synthesize themes and patterns from those messages. Don't list messages — describe the vibe, the worries, the themes — and tie them to the time window (use the section label and bracket stamps).
- If the period has no messages, be honest: "I don't have messages from that far back yet."

Briefs and overviews (today, tomorrow, next week, etc.): Give a short narrative — what matters most first, what's on calendar, what's on lists. Prioritize by dates. When a month/quarter is starting, mention items with matching period labels. This path is read-only — don't say you're adding tasks.

Prioritization ("what should I focus on", "top tasks", "most important"): Rank by (1) overdue, (2) aligned with goals/aspirations from memory, (3) due today, (4) quick wins.

Completion checks ("did I already do X?"): Check the recently closed section first, then open tasks.

Ideas ("what ideas did I have?", "list my ideas", "any ideas about X?"): Look for memory facts with key "ideas" in the Memory section. List them clearly — these are speculative thoughts the user dumped previously. Present them as seeds, not tasks. If none found, say "You haven't shared any ideas with me yet."

Chat photos and image context:
- If the Question or context includes "[Photo: ...]", "Image description:", "User photo caption:", or Pem's dual image blocks ("Image — for your reply" / "Image — full detail"), that text IS Pem's read of what they sent. Prefer the short focus line for conversational recall; use full detail when they ask for specifics. Answer like a friend who was shown the album.
- The client may attach a small row of thumbnails when they asked for past photos OR when they are recalling a person, meeting, trip, or topic and stored images plausibly match — ranked to their wording, not random picks.
- If thumbnails are present, describe those same scenes; do not contradict them.
- FORBIDDEN (never write, even partially): "can't show photos", "can't pull up", "can't display images", "don't have access to your photos", "can't view attachments", "only see text", "I'm not able to show images".
- If nothing in the context matches what they asked (e.g. no LA trip in the descriptions), say you don't find photos in chat about that topic yet — that is a data gap, not a capability gap.

Tone: Be warm and natural. Talk like a friend who knows them well. No markdown, no bullet points. Use natural prose.`,
        prompt: `${summaryBlock}${memorySection ? `Memory:\n${memorySection}\n\n` : ''}All open tasks:\n${allOpenBlock}\n\n${timelineBlock ? `Timeline view:\n${timelineBlock}\n\n` : ''}${closedBlock ? `${closedBlock}\n\n` : ''}${ragBlock ? `${ragBlock}\n\n` : ''}${temporalBlock ? `${temporalBlock}\n\n` : ''}${recentChatBlock ? `${recentChatBlock}\n\n` : ''}Question:\n"""${question.slice(0, 4000)}"""`,
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
        `Chat question failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return {
        text: "I couldn't answer that just now. Could you try again?",
      };
    }
  }
}
