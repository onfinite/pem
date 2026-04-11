import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, lte, ne } from 'drizzle-orm';

import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import { extractsTable } from '../../../database/schemas';
import { PushService } from '../../../push/push.service';

@Injectable()
export class ReminderCronService {
  private readonly log = new Logger(ReminderCronService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly push: PushService,
  ) {}

  @Cron('* * * * *')
  async processReminders(): Promise<void> {
    const now = new Date();

    const dueReminders = await this.db
      .select({
        id: extractsTable.id,
        userId: extractsTable.userId,
        text: extractsTable.extractText,
      })
      .from(extractsTable)
      .where(
        and(
          lte(extractsTable.reminderAt, now),
          eq(extractsTable.reminderSent, false),
          ne(extractsTable.status, 'done'),
          ne(extractsTable.status, 'dismissed'),
        ),
      );

    if (dueReminders.length === 0) return;

    this.log.log(`Processing ${dueReminders.length} due reminders`);

    for (const reminder of dueReminders) {
      try {
        await this.push.notifyReminder(reminder.userId, reminder.text);
        await this.db
          .update(extractsTable)
          .set({ reminderSent: true })
          .where(eq(extractsTable.id, reminder.id));
      } catch (e) {
        this.log.error(
          `Reminder failed for extract ${reminder.id}: ${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }
}
