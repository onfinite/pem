import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import { calendarConnectionsTable } from '../../../database/schemas';
import { CalendarSyncService } from '../../../calendar/calendar-sync.service';

@Injectable()
export class CalendarCronService {
  private readonly log = new Logger(CalendarCronService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('calendar-sync') private readonly calendarQueue: Queue,
    private readonly sync: CalendarSyncService,
  ) {}

  /** Every 2 hours: enqueue sync jobs for all active Google connections. */
  @Cron(CronExpression.EVERY_2_HOURS)
  async enqueueGoogleSyncs(): Promise<void> {
    const rows = await this.db
      .select({ id: calendarConnectionsTable.id })
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.provider, 'google'));

    if (rows.length === 0) return;

    this.log.log(`Enqueuing ${rows.length} Google Calendar sync jobs`);
    for (const row of rows) {
      await this.calendarQueue.add(
        'sync',
        { connectionId: row.id },
        { removeOnComplete: true, removeOnFail: 50, attempts: 2 },
      );
    }
  }

  /** Every hour: auto-done past calendar events. */
  @Cron(CronExpression.EVERY_HOUR)
  async autoDonePastEvents(): Promise<void> {
    const count = await this.sync.autoDonePastEvents();
    if (count > 0) {
      this.log.log(`Auto-done ${count} past calendar events`);
    }
  }
}
