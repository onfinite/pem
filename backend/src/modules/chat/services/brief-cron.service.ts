import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { and, asc, eq, gt, gte, ne, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  extractsTable,
  listsTable,
  messagesTable,
  usersTable,
} from '@/database/schemas/index';
import { EmbeddingsService } from '@/modules/chat/services/embeddings.service';
import { ExtractsService } from '@/modules/extracts/services/extracts.service';
import { ProfileService } from '@/modules/profile/profile.service';
import { PushService } from '@/modules/push/push.service';
import { GoogleCalendarService } from '@/modules/calendar/services/google-calendar.service';
import { calendarConnectionsTable } from '@/database/schemas/index';
import { logWithContext } from '@/core/utils/format-log-context';
import { BriefBodyLlmService } from '@/modules/chat/services/brief-body-llm.service';

@Injectable()
export class BriefCronService {
  private readonly log = new Logger(BriefCronService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly push: PushService,
    private readonly embeddings: EmbeddingsService,
    private readonly profile: ProfileService,
    private readonly extracts: ExtractsService,
    private readonly googleCal: GoogleCalendarService,
    private readonly briefBodyLlm: BriefBodyLlmService,
  ) {}

  @Cron('0 * * * *')
  async checkAndGenerateBriefs(): Promise<void> {
    const USERS_PAGE = 500;
    let userCount = 0;
    let lastUserId: string | null = null;
    for (;;) {
      const users = await this.db
        .select()
        .from(usersTable)
        .where(lastUserId ? gt(usersTable.id, lastUserId) : sql`true`)
        .orderBy(asc(usersTable.id))
        .limit(USERS_PAGE);
      if (!users.length) break;
      userCount += users.length;
      lastUserId = users[users.length - 1].id;

      for (const user of users) {
        if (!user.timezone) {
          this.log.debug(
            logWithContext('Skipping user — no timezone', {
              scope: 'cron.brief',
              userId: user.id,
            }),
          );
          continue;
        }
        try {
          const userNow = DateTime.now().setZone(user.timezone);
          const notifTime = user.notificationTime ?? '07:00';
          const [nh] = notifTime.split(':').map(Number);

          this.log.debug(
            logWithContext('Brief cron user hour check', {
              scope: 'cron.brief',
              userId: user.id,
              timezone: user.timezone,
              notifTime,
              userHour: userNow.hour,
            }),
          );

          if (userNow.hour === nh) {
            await this.ensureBriefForToday(user);
          }
        } catch (e) {
          this.log.error(
            logWithContext('Brief check failed', {
              scope: 'cron.brief',
              userId: user.id,
              detail: e instanceof Error ? e.message : 'unknown',
            }),
          );
        }
      }

      if (users.length < USERS_PAGE) break;
    }
    this.log.log(
      logWithContext('Brief cron tick complete', {
        scope: 'cron.brief',
        usersScanned: userCount,
      }),
    );
  }

  async ensureBriefForToday(
    user: typeof usersTable.$inferSelect,
  ): Promise<{ generated: boolean; briefId?: string }> {
    if (!user.timezone) return { generated: false };

    const userNow = DateTime.now().setZone(user.timezone);
    const todayStart = userNow.startOf('day').toJSDate();

    const existingBrief = await this.db
      .select({ id: messagesTable.id })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.userId, user.id),
          eq(messagesTable.kind, 'brief'),
          eq(messagesTable.role, 'pem'),
          gte(messagesTable.createdAt, todayStart),
        ),
      )
      .limit(1);

    let briefId: string | null | undefined = existingBrief[0]?.id;
    let generated = false;

    if (existingBrief.length === 0) {
      briefId = await this.generateBrief(
        user.id,
        user.timezone,
        user.name,
        user.summary,
      );
      generated = !!briefId;
    }

    if (user.pushToken) {
      await this.push.notifyBrief(user.id);
    }

    await this.db
      .update(usersTable)
      .set({
        lastBriefDate: todayStart,
        lastBriefPushDate: user.pushToken ? new Date() : undefined,
      })
      .where(eq(usersTable.id, user.id));

    return { generated, briefId: briefId ?? undefined };
  }

  async generateBrief(
    userId: string,
    timezone: string,
    userName?: string | null,
    userSummary?: string | null,
  ): Promise<string | null> {
    if (!this.config.get<string>('openai.apiKey')) {
      this.log.warn(
        logWithContext('No OpenAI API key — skipping brief', {
          scope: 'brief.generate',
          userId,
        }),
      );
      return null;
    }

    const allOpen = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          ne(extractsTable.status, 'closed'),
        ),
      );

    const now = new Date();
    const openExtracts = allOpen.filter((r) => {
      const isCalEvent = r.source === 'calendar' || !!r.externalEventId;
      if (isCalEvent && r.eventEndAt && r.eventEndAt < now) return false;
      return true;
    });

    const luxNow = DateTime.now().setZone(timezone);
    const todayStr = luxNow.toISODate();
    const todayStart = luxNow.startOf('day').toJSDate();
    const todayEnd = luxNow.endOf('day').toJSDate();
    const weekEnd = luxNow
      .plus({ days: 7 - luxNow.weekday })
      .endOf('day')
      .toJSDate();
    const monthStart = luxNow.startOf('month').toJSDate();
    const monthEnd = luxNow.endOf('month').toJSDate();

    const anchor = (e: (typeof openExtracts)[0]) =>
      e.scheduledAt ?? e.eventStartAt ?? e.dueAt ?? e.periodStart;
    const overdue = openExtracts.filter(
      (e) => (e.dueAt && e.dueAt < now) || (e.eventEndAt && e.eventEndAt < now),
    );
    const todayItems = openExtracts.filter((e) => {
      const a = anchor(e);
      return a && a >= todayStart && a <= todayEnd;
    });
    const thisWeekItems = openExtracts.filter((e) => {
      const a = anchor(e);
      return a && a > todayEnd && a <= weekEnd;
    });
    const monthItems = openExtracts.filter((e) => {
      const ps = e.periodStart;
      const pe = e.periodEnd;
      if (!ps || !pe) return false;
      return pe >= monthStart && ps <= monthEnd && ps > weekEnd;
    });

    const isFirstWeek = luxNow.day <= 7;
    let monthStartNudge = '';
    if (isFirstWeek) {
      const currentMonthName = luxNow.toFormat('LLLL').toLowerCase();
      const monthStartItems = openExtracts.filter((e) => {
        const label = e.periodLabel?.toLowerCase();
        if (!label) return false;
        return (
          label === 'this month' ||
          label === currentMonthName ||
          label.includes(currentMonthName)
        );
      });
      if (monthStartItems.length > 0) {
        monthStartNudge = `\nNew month reminder: You planned these for ${luxNow.toFormat('LLLL')}: ${monthStartItems.map((e) => e.extractText).join(', ')}. Nudge the user to schedule or revisit them.`;
      }
    }

    let listCountsLine = '';
    try {
      const listRows = await this.db
        .select({ name: listsTable.name, id: listsTable.id })
        .from(listsTable)
        .where(eq(listsTable.userId, userId));
      if (listRows.length > 0) {
        const parts: string[] = [];
        for (const lr of listRows) {
          const cnt = openExtracts.filter((e) => e.listId === lr.id).length;
          if (cnt > 0) parts.push(`${lr.name}: ${cnt} items`);
        }
        listCountsLine = parts.join('\n');
      }
    } catch {
      /* lists table may not exist yet */
    }

    const calendarItems = openExtracts.filter((e) => e.eventStartAt);

    let birthdayNames: string[] = [];
    try {
      const [conn] = await this.db
        .select()
        .from(calendarConnectionsTable)
        .where(eq(calendarConnectionsTable.userId, userId))
        .limit(1);
      if (conn?.googleAccessToken && conn?.googleRefreshToken) {
        const result = await this.googleCal.fetchTodayBirthdays(
          conn.googleAccessToken,
          conn.googleRefreshToken,
        );
        birthdayNames = result.names;
      }
    } catch {
      /* birthday fetch is best-effort */
    }

    const closedYesterday = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.status, 'closed'),
          gte(extractsTable.closedAt, sql`now() - interval '24 hours'`),
        ),
      );

    const calendarTodayStr =
      calendarItems
        .filter((e) => {
          const start = e.eventStartAt;
          if (!start || !todayStr) return false;
          const startInTz = DateTime.fromJSDate(start).setZone(timezone);
          return startInTz.toISODate() === todayStr;
        })
        .map(
          (e) =>
            `${e.extractText} at ${DateTime.fromJSDate(e.eventStartAt!).setZone(timezone).toLocaleString(DateTime.TIME_SIMPLE)}${e.eventLocation ? ` (${e.eventLocation})` : ''}`,
        )
        .join(', ') || 'nothing';

    const dateDisplay = now.toLocaleDateString('en-US', {
      timeZone: timezone,
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    let memorySection = '';
    try {
      memorySection = await this.profile.buildMemoryPromptSection(userId);
    } catch (e) {
      this.log.warn(
        logWithContext('Brief memory fetch failed', {
          scope: 'brief.generate',
          userId,
          detail: e instanceof Error ? e.message : 'unknown',
        }),
      );
    }

    let ragSection = '';
    let worriesSection = '';
    try {
      const [ragResults, worryResults] = await Promise.all([
        this.embeddings.similaritySearch(
          userId,
          'What is the user working toward? Goals, plans, priorities, upcoming commitments',
          5,
        ),
        this.embeddings.similaritySearch(
          userId,
          'What is the user worried about, stressed about, or keeps mentioning repeatedly?',
          5,
        ),
      ]);
      if (ragResults.length > 0) {
        ragSection = ragResults
          .map((r) => `- ${r.content.slice(0, 200)}`)
          .join('\n');
      }
      if (worryResults.length > 0) {
        worriesSection = worryResults
          .map((r) => `- ${r.content.slice(0, 200)}`)
          .join('\n');
      }
    } catch (e) {
      this.log.warn(
        logWithContext('Brief RAG query failed', {
          scope: 'brief.generate',
          userId,
          detail: e instanceof Error ? e.message : 'unknown',
        }),
      );
    }

    const context = `Today's date: ${dateDisplay}

Closed yesterday: ${closedYesterday.length > 0 ? closedYesterday.map((e) => e.extractText).join(', ') : 'nothing'}

Overdue: ${overdue.length > 0 ? overdue.map((e) => `${e.extractText} (due ${e.dueAt?.toLocaleDateString()})`).join(', ') : 'none'}

Today: ${todayItems.length > 0 ? todayItems.map((e) => e.extractText).join(', ') : 'nothing specific'}

Calendar today: ${calendarTodayStr}
${birthdayNames.length > 0 ? `\nBirthdays today: ${birthdayNames.join(', ')}. Mention this warmly — wish them a happy birthday naturally.\n` : ''}
This week: ${thisWeekItems.length > 0 ? thisWeekItems.map((e) => e.extractText).join(', ') : 'nothing'}

${monthItems.length > 0 ? `This month you mentioned: ${monthItems.map((e) => `${e.extractText}${e.periodLabel ? ` (${e.periodLabel})` : ''}`).join(', ')}. Would any of these benefit from being scheduled?` : ''}${monthStartNudge}

${listCountsLine || 'No list items'}

${memorySection ? `## What I know about this user\n${memorySection}` : ''}
${ragSection ? `## Recent relevant context\n${ragSection}` : ''}
${worriesSection ? `## Recurring concerns\n${worriesSection}` : ''}`;

    const timeOfDay =
      luxNow.hour < 12 ? 'morning' : luxNow.hour < 17 ? 'afternoon' : 'evening';
    const dayOfWeek = luxNow.toFormat('cccc');
    const systemPrompt = this.briefBodyLlm.buildBriefSystem(
      timeOfDay,
      dayOfWeek,
    );

    const agentModel = this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

    const nameNote = userName
      ? `\nThe user's name is ${userName}. Use it occasionally.`
      : '';
    const summaryBlock = userSummary
      ? `\nAbout the user:\n${userSummary}\n`
      : '';

    try {
      const briefText = await this.briefBodyLlm.generateBriefBodyText({
        agentModel,
        systemPrompt,
        userPrompt: `${summaryBlock}${nameNote}\n\n${context}`,
      });

      const [briefMsg] = await this.db
        .insert(messagesTable)
        .values({
          userId,
          role: 'pem',
          kind: 'brief',
          content: briefText,
        })
        .returning({
          id: messagesTable.id,
          createdAt: messagesTable.createdAt,
        });

      this.log.log(
        logWithContext('Brief generated', {
          scope: 'brief.generate',
          userId,
          timezone,
        }),
      );

      if (briefMsg) {
        this.embeddings
          .embedChatMessageIfAbsent({
            messageId: briefMsg.id,
            userId,
            role: 'pem',
            text: briefText,
            createdAt: briefMsg.createdAt,
          })
          .catch((e) =>
            this.log.warn(
              logWithContext('Brief embed failed', {
                scope: 'brief.embed',
                userId,
                messageId: briefMsg.id,
                detail: e instanceof Error ? e.message : 'unknown',
              }),
            ),
          );
      }

      return briefMsg?.id ?? null;
    } catch (e) {
      this.log.error(
        logWithContext('Brief LLM failed', {
          scope: 'brief.generate',
          userId,
          detail: e instanceof Error ? e.message : 'unknown',
        }),
      );
      return null;
    }
  }
}
