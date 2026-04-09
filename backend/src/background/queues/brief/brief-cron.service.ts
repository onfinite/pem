import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { and, eq, gte, ne, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import {
  extractsTable,
  messagesTable,
  usersTable,
} from '../../../database/schemas';
import { PushService } from '../../../push/push.service';

const BRIEF_SYSTEM = `You are Pem, writing a morning brief to the user. This is a message in their chat — like getting a text from a trusted friend who manages their day.

Rules:
- Plain conversational text. NO markdown, NO bold, NO bullet points, NO numbered lists.
- Reads like a text from a person, not a report.
- Mention specific items by name.
- If there are overdue items, mention them firmly but warmly.
- Include actionable time context: "leave by 3:30 for the dentist at 4pm".
- If the day is light, say so cheerfully.
- Keep it under 200 words.
- Start with "Good morning." or similar warm opener.`;

@Injectable()
export class BriefCronService {
  private readonly log = new Logger(BriefCronService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly push: PushService,
  ) {}

  @Cron('0 * * * *')
  async checkAndGenerateBriefs(): Promise<void> {
    const users = await this.db.select().from(usersTable);

    for (const user of users) {
      if (!user.timezone) continue;
      try {
        const userNow = DateTime.now().setZone(user.timezone);

        // Generate brief at midnight
        if (userNow.hour === 0) {
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
          if (existingBrief.length === 0) {
            await this.generateBrief(
              user.id,
              user.timezone,
              user.name,
              user.summary,
            );
          }
        }

        // Push notification at user's notification time
        const notifTime = user.notificationTime ?? '07:00';
        const [nh] = notifTime.split(':').map(Number);
        if (userNow.hour === nh && user.pushToken) {
          const todayStart = userNow.startOf('day').toJSDate();
          const brief = await this.db
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
          if (brief.length > 0) {
            await this.push.notifyBrief(user.id);
          }
        }
      } catch (e) {
        this.log.error(
          `Brief check failed for user ${user.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  async generateBrief(
    userId: string,
    timezone: string,
    userName?: string | null,
    userSummary?: string | null,
  ): Promise<void> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return;

    const openExtracts = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          ne(extractsTable.status, 'done'),
          ne(extractsTable.status, 'dismissed'),
        ),
      );

    const now = new Date();
    const todayStr = DateTime.now().setZone(timezone).toISODate();
    const overdue = openExtracts.filter((e) => e.dueAt && e.dueAt < now);
    const todayItems = openExtracts.filter((e) => e.urgency === 'today');
    const thisWeekItems = openExtracts.filter((e) => e.urgency === 'this_week');
    const shopping = openExtracts.filter((e) => e.batchKey === 'shopping');
    const errands = openExtracts.filter((e) => e.batchKey === 'errands');
    const calendarItems = openExtracts.filter((e) => e.eventStartAt);

    const doneYesterday = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.status, 'done'),
          gte(extractsTable.doneAt, sql`now() - interval '24 hours'`),
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

    const context = `Today's date: ${now.toLocaleDateString('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric' })}

Completed yesterday: ${doneYesterday.length > 0 ? doneYesterday.map((e) => e.extractText).join(', ') : 'nothing'}

Overdue: ${overdue.length > 0 ? overdue.map((e) => `${e.extractText} (due ${e.dueAt?.toLocaleDateString()})`).join(', ') : 'none'}

Today: ${todayItems.length > 0 ? todayItems.map((e) => e.extractText).join(', ') : 'nothing specific'}

Calendar today: ${calendarTodayStr}

This week: ${thisWeekItems.length} items
Shopping list: ${shopping.length} items
Errands: ${errands.length} items`;

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
        system: BRIEF_SYSTEM,
        prompt: `${summaryBlock}${nameNote}\n\n${context}`,
      });

      await this.db.insert(messagesTable).values({
        userId,
        role: 'pem',
        kind: 'brief',
        content: result.text,
      });

      this.log.log(`Brief generated for user ${userId}`);
    } catch (e) {
      this.log.error(
        `Brief LLM failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
