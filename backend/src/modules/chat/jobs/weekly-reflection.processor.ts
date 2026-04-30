import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, eq, gte, desc, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Job } from 'bullmq';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  extractsTable,
  messagesTable,
  usersTable,
} from '@/database/schemas/index';
import { EmbeddingsService } from '@/modules/chat/services/embeddings.service';
import { ProfileService } from '@/modules/profile/profile.service';
import { PushService } from '@/modules/push/push.service';
import { logWithContext } from '@/core/utils/format-log-context';
import { WeeklyReflectionLlmService } from '@/modules/chat/services/weekly-reflection-llm.service';

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
    private readonly weeklyReflectionLlm: WeeklyReflectionLlmService,
  ) {
    super();
  }

  async process(job: Job<{ userId: string }>): Promise<void> {
    const { userId } = job.data;
    this.log.log(
      logWithContext('Generating weekly reflection', {
        scope: 'weekly.reflection',
        userId,
        jobId: job.id ?? undefined,
      }),
    );

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
      this.log.log(
        logWithContext('Reflection already exists for week', {
          scope: 'weekly.reflection',
          userId,
          isoWeek,
        }),
      );
      return;
    }

    if (!this.config.get<string>('openai.apiKey')) return;

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
      const agentModel =
        this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

      const reflectionText = await this.weeklyReflectionLlm.generateBodyText({
        agentModel,
        userPrompt: `${summaryBlock}${nameNote}\n\n${context}`,
      });

      const [msg] = await this.db
        .insert(messagesTable)
        .values({
          userId,
          role: 'pem',
          kind: 'reflection',
          content: reflectionText,
        })
        .returning({
          id: messagesTable.id,
          createdAt: messagesTable.createdAt,
        });

      this.log.log(
        logWithContext('Weekly reflection generated', {
          scope: 'weekly.reflection',
          userId,
          jobId: job.id ?? undefined,
        }),
      );

      if (msg) {
        this.embeddings
          .embedChatMessageIfAbsent({
            messageId: msg.id,
            userId,
            role: 'pem',
            text: reflectionText,
            createdAt: msg.createdAt,
          })
          .catch((e) =>
            this.log.warn(
              logWithContext('Weekly reflection embed failed', {
                scope: 'weekly.reflection',
                userId,
                messageId: msg.id,
                detail: e instanceof Error ? e.message : 'unknown',
              }),
            ),
          );
      }

      if (user.pushToken) {
        await this.push.notifyBrief(userId).catch((e) =>
          this.log.warn(
            logWithContext('Weekly reflection push failed', {
              scope: 'weekly.reflection',
              userId,
              detail: e instanceof Error ? e.message : 'unknown',
            }),
          ),
        );
      }
    } catch (e) {
      this.log.error(
        logWithContext('Weekly reflection failed', {
          scope: 'weekly.reflection',
          userId,
          jobId: job.id ?? undefined,
          detail: e instanceof Error ? e.message : 'unknown',
        }),
      );
    }
  }
}
