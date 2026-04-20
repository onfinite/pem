import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { and, eq, gte, desc, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Job } from 'bullmq';

import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import {
  extractsTable,
  messagesTable,
  usersTable,
} from '../../../database/schemas';
import { EmbeddingsService } from '../../../embeddings/embeddings.service';
import { ProfileService } from '../../../profile/profile.service';
import { PushService } from '../../../push/push.service';

function buildReflectionSystem(): string {
  return `You are Pem writing a weekly reflection. This is a message in the user's chat — like getting a Sunday evening text from a friend who's been paying attention all week.

This is NOT a task list. NOT a summary. It's a mirror — you reflect back what the user's week looked like through the lens of what they shared with you.

Rules:
- Plain conversational text. NO markdown, NO bold, NO bullet points, NO numbered lists.
- Reads like a text from a person who knows them, not a productivity report.
- Name what the user talked about most this week by THEME, not by listing tasks.
- Mention what they handled — give them credit.
- Name the ONE thing that's still sitting there unresolved — gently, not as pressure.
- If something keeps coming up week after week (visible in recurring themes or memory), say so warmly: "The money thing is still there. No rush — just noticing."
- If the user stored ideas this week (memory_key: "ideas" in memory), mention the most interesting one — not as a task, just as a seed worth revisiting. "That idea about X is still sitting there."
- End with a forward look — not a plan, an invitation. "Next week?" or "What's on your mind heading into Monday?"
- Five sentences max. Short sentences.
- NEVER use exclamation marks excessively. One max, only if genuine.
- NEVER end with offers of help. Just reflect and stop.
- NEVER use forbidden filler: "let me know", "feel free", "happy to help", "is there anything".`;
}

@Injectable()
@Processor('weekly-planning')
export class WeeklyReflectionProcessor extends WorkerHost {
  private readonly log = new Logger(WeeklyReflectionProcessor.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
    private readonly profile: ProfileService,
    private readonly push: PushService,
  ) {
    super();
  }

  async process(job: Job<{ userId: string }>): Promise<void> {
    const { userId } = job.data;
    this.log.log(`Generating weekly reflection for ${userId}`);

    const [user] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!user?.timezone) return;

    const tz = user.timezone;
    const luxNow = DateTime.now().setZone(tz);
    const isoWeek = luxNow.toFormat("kkkk-'W'WW");

    const existing = await this.db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, userId),
          eq(messagesTable.kind, 'reflection'),
          eq(messagesTable.role, 'pem'),
          gte(messagesTable.createdAt, luxNow.startOf('week').toJSDate()),
        ),
      )
      .limit(1);
    if (existing.length > 0) {
      this.log.log(`Reflection already exists for ${userId} week ${isoWeek}`);
      return;
    }

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return;

    const weekAgo = luxNow.minus({ days: 7 }).toJSDate();

    const [
      userMessages,
      createdThisWeek,
      closedThisWeek,
      allOpen,
      memorySection,
      ragResults,
    ] = await Promise.all([
      this.db
        .select({
          content: messagesTable.content,
          transcript: messagesTable.transcript,
          kind: messagesTable.kind,
          createdAt: messagesTable.createdAt,
        })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.userId, userId),
            eq(messagesTable.role, 'user'),
            gte(messagesTable.createdAt, weekAgo),
          ),
        )
        .orderBy(desc(messagesTable.createdAt))
        .limit(50),
      this.db
        .select({ text: extractsTable.extractText, tone: extractsTable.tone })
        .from(extractsTable)
        .where(
          and(
            eq(extractsTable.userId, userId),
            gte(extractsTable.createdAt, weekAgo),
          ),
        )
        .limit(100),
      this.db
        .select({ text: extractsTable.extractText })
        .from(extractsTable)
        .where(
          and(
            eq(extractsTable.userId, userId),
            eq(extractsTable.status, 'closed'),
            gte(extractsTable.closedAt, weekAgo),
          ),
        )
        .limit(100),
      this.db
        .select({
          text: extractsTable.extractText,
          status: extractsTable.status,
          urgency: extractsTable.urgency,
        })
        .from(extractsTable)
        .where(
          and(
            eq(extractsTable.userId, userId),
            sql`${extractsTable.status} IN ('inbox', 'snoozed')`,
          ),
        )
        .limit(100),
      this.profile.buildMemoryPromptSection(userId),
      this.embeddings
        .similaritySearch(
          userId,
          'What recurring themes, worries, and patterns have come up this week?',
          5,
        )
        .catch(() => []),
    ]);

    const userMsgText = userMessages
      .map((m) => {
        const text = m.transcript ?? m.content ?? '';
        return `- [${m.kind}] ${text.slice(0, 300)}`;
      })
      .join('\n');

    const createdText = createdThisWeek
      .map((e) => `- ${e.text}${e.tone ? ` (${e.tone})` : ''}`)
      .join('\n');

    const closedText = closedThisWeek.map((e) => `- ${e.text}`).join('\n');

    const openText = allOpen
      .map((e) => `- ${e.text}${e.urgency === 'holding' ? ' (holding)' : ''}`)
      .join('\n');

    const ragText = ragResults
      .map((r) => `- ${r.content.slice(0, 200)}`)
      .join('\n');

    const context = `Week ending: ${luxNow.toFormat('cccc, LLLL d')}

What the user said this week (${userMessages.length} messages):
${userMsgText || '(no messages this week)'}

Tasks created this week (${createdThisWeek.length}):
${createdText || '(none)'}

Tasks closed this week (${closedThisWeek.length}):
${closedText || '(none)'}

Still open (${allOpen.length}):
${openText || '(none)'}

${memorySection ? `Memory:\n${memorySection}` : ''}
${ragText ? `Recurring themes:\n${ragText}` : ''}`;

    const nameNote = user.name
      ? `\nThe user's name is ${user.name}. Use it naturally.`
      : '';
    const summaryBlock = user.summary
      ? `\nAbout the user:\n${user.summary}\n`
      : '';

    try {
      const openai = createOpenAI({ apiKey });
      const agentModel =
        this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

      const result = await generateText({
        model: openai(agentModel),
        system: buildReflectionSystem(),
        prompt: `${summaryBlock}${nameNote}\n\n${context}`,
        maxOutputTokens: 1024,
      });

      const [msg] = await this.db
        .insert(messagesTable)
        .values({
          userId,
          role: 'pem',
          kind: 'reflection',
          content: result.text,
        })
        .returning({
          id: messagesTable.id,
          createdAt: messagesTable.createdAt,
        });

      this.log.log(`Weekly reflection generated for ${userId}`);

      if (msg) {
        this.embeddings
          .embedChatMessageIfAbsent({
            messageId: msg.id,
            userId,
            role: 'pem',
            text: result.text,
            createdAt: msg.createdAt,
          })
          .catch(() => {});
      }

      if (user.pushToken) {
        await this.push.notifyBrief(userId).catch(() => {});
      }
    } catch (e) {
      this.log.error(
        `Weekly reflection failed for ${userId}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
