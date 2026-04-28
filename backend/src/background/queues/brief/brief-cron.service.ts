import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
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
import { EmbeddingsService } from '@/embeddings/embeddings.service';
import { ExtractsService } from '@/extracts/extracts.service';
import { ProfileService } from '@/profile/profile.service';
import { PushService } from '@/push/push.service';
import { GoogleCalendarService } from '@/calendar/google-calendar.service';
import { calendarConnectionsTable } from '@/database/schemas/index';

function buildBriefSystem(timeOfDay: string, dayOfWeek: string): string {
  return `You are Pem, writing a brief to the user. This is a message in their chat — like getting a text from a trusted friend who manages their day.

Current time context: ${timeOfDay} on a ${dayOfWeek}.

Greeting rules:
- Morning (before noon): "Good morning, {name}." or a warm variant.
- Afternoon (12-17): "Good afternoon, {name}." or "Hey {name}, here's your day."
- Evening (17+): "Good evening, {name}."
- Weekend (Sat/Sun morning): "Good weekend, {name}." or "Happy Saturday/Sunday, {name}."
- Monday morning: "Happy Monday, {name}." or a fresh-start tone.
- If the day is light, reflect that cheerfully.

Rules:
- Plain conversational text. NO markdown, NO bold, NO bullet points, NO numbered lists.
- Reads like a text from a person, not a report.
- Mention specific items by name.
- If there are overdue items, mention them firmly but warmly.
- Include actionable time context: "leave by 3:30 for the dentist at 4pm".
- If the day is light, say so cheerfully.
- When a new month or quarter is starting (first few days), mention items the user saved for "this month", the month name, etc. — gently nudge to schedule them.
- When memory or past context is relevant to today's tasks, weave it in naturally — e.g. "I know you're aiming for X, so prioritizing Y today makes sense." Only reference past context when it adds value; don't force it.
- If the user has mentioned something repeatedly (visible in "Recurring concerns" or memory), acknowledge it briefly — not as a task, but as awareness. One sentence max. Example: "The money thing keeps coming up." Don't therapize. Just show you noticed.
- If the user has routines (visible in memory as "routines" or "scheduling_habits"), acknowledge them naturally — "6 AM run, then the day starts" — don't list them as tasks.
- If something feels emotionally heavy based on context, acknowledge it warmly at the end. A single human sentence — "I know the Denver thing is weighing on you" — not a paragraph.
- Keep it under 200 words.`;
}

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
          this.log.debug(`Skipping ${user.id} — no timezone`);
          continue;
        }
        try {
          const userNow = DateTime.now().setZone(user.timezone);
          const notifTime = user.notificationTime ?? '07:00';
          const [nh] = notifTime.split(':').map(Number);

          this.log.debug(
            `User ${user.id}: tz=${user.timezone}, notifTime=${notifTime}, userHour=${userNow.hour}`,
          );

          if (userNow.hour === nh) {
            await this.ensureBriefForToday(user);
          }
        } catch (e) {
          this.log.error(
            `Brief check failed for user ${user.id}: ${e instanceof Error ? e.message : String(e)}`,
          );
        }
      }

      if (users.length < USERS_PAGE) break;
    }
    this.log.log(`Brief cron tick — ${userCount} users scanned`);
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
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn(`No OpenAI API key — skipping brief for ${userId}`);
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
        `Brief memory fetch failed for ${userId}: ${e instanceof Error ? e.message : String(e)}`,
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
        `Brief RAG query failed for ${userId}: ${e instanceof Error ? e.message : String(e)}`,
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
    const systemPrompt = buildBriefSystem(timeOfDay, dayOfWeek);

    const openai = createOpenAI({ apiKey });
    const agentModel = this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

    const nameNote = userName
      ? `\nThe user's name is ${userName}. Use it occasionally.`
      : '';
    const summaryBlock = userSummary
      ? `\nAbout the user:\n${userSummary}\n`
      : '';

    try {
      const result = await generateText({
        model: openai(agentModel),
        system: systemPrompt,
        prompt: `${summaryBlock}${nameNote}\n\n${context}`,
        maxOutputTokens: 2048,
      });

      const [briefMsg] = await this.db
        .insert(messagesTable)
        .values({
          userId,
          role: 'pem',
          kind: 'brief',
          content: result.text,
        })
        .returning({
          id: messagesTable.id,
          createdAt: messagesTable.createdAt,
        });

      this.log.log(`Brief generated for ${userId} (${timezone})`);

      if (briefMsg) {
        this.embeddings
          .embedChatMessageIfAbsent({
            messageId: briefMsg.id,
            userId,
            role: 'pem',
            text: result.text,
            createdAt: briefMsg.createdAt,
          })
          .catch((e) =>
            this.log.warn(
              `Brief embed failed: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
      }

      return briefMsg?.id ?? null;
    } catch (e) {
      this.log.error(
        `Brief LLM failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
