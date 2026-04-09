import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { and, eq, ne, isNotNull, lte, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import {
  calendarConnectionsTable,
  extractsTable,
  usersTable,
} from '../../../database/schemas';
import { CalendarSyncService } from '../../../calendar/calendar-sync.service';

@Injectable()
export class CalendarCronService {
  private readonly log = new Logger(CalendarCronService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('calendar-sync') private readonly calendarQueue: Queue,
    @InjectQueue('weekly-planning')
    private readonly weeklyPlanningQueue: Queue,
    private readonly sync: CalendarSyncService,
  ) {}

  @Cron(CronExpression.EVERY_30_MINUTES)
  async enqueueGoogleSyncs(): Promise<void> {
    const rows = await this.db
      .select({
        id: calendarConnectionsTable.id,
        status: calendarConnectionsTable.connectionStatus,
      })
      .from(calendarConnectionsTable)
      .where(eq(calendarConnectionsTable.provider, 'google'));

    const healthy = rows.filter((r) => r.status !== 'disconnected');
    if (healthy.length === 0) return;

    this.log.log(`Enqueuing ${healthy.length} Google Calendar sync jobs`);
    for (const row of healthy) {
      await this.calendarQueue.add(
        'sync',
        { connectionId: row.id },
        {
          jobId: `cal-sync-${row.id}`,
          removeOnComplete: true,
          removeOnFail: 50,
          attempts: 2,
        },
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async autoDonePastEvents(): Promise<void> {
    const count = await this.sync.autoDonePastEvents();
    if (count > 0) {
      this.log.log(`Auto-done ${count} past calendar events`);
    }
  }

  /** Hourly: auto-promote urgency as dates approach. */
  @Cron(CronExpression.EVERY_HOUR)
  async autoPromoteUrgency(): Promise<void> {
    const now = new Date();
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const toToday = await this.db
      .update(extractsTable)
      .set({ urgency: 'today', updatedAt: now })
      .where(
        and(
          eq(extractsTable.urgency, 'this_week'),
          ne(extractsTable.status, 'done'),
          ne(extractsTable.status, 'dismissed'),
          isNotNull(extractsTable.dueAt),
          lte(extractsTable.dueAt, sql`CURRENT_DATE + INTERVAL '1 day'`),
        ),
      )
      .returning({ id: extractsTable.id });

    const toThisWeek = await this.db
      .update(extractsTable)
      .set({ urgency: 'this_week', updatedAt: now })
      .where(
        and(
          eq(extractsTable.urgency, 'none'),
          ne(extractsTable.status, 'done'),
          ne(extractsTable.status, 'dismissed'),
          isNotNull(extractsTable.dueAt),
          lte(extractsTable.dueAt, sevenDays),
        ),
      )
      .returning({ id: extractsTable.id });

    if (toToday.length || toThisWeek.length) {
      this.log.log(
        `Urgency promoted: ${toToday.length} → today, ${toThisWeek.length} → this_week`,
      );
    }
  }

  /** Hourly: check if it's Sunday 6-11pm for any user → enqueue weekly planning. */
  @Cron(CronExpression.EVERY_HOUR)
  async enqueueWeeklyPlanning(): Promise<void> {
    const users = await this.db
      .select({ id: usersTable.id, timezone: usersTable.timezone })
      .from(usersTable)
      .where(isNotNull(usersTable.timezone));

    let enqueued = 0;
    for (const u of users) {
      const local = DateTime.now().setZone(u.timezone!);
      if (local.weekday !== 7 || local.hour < 18 || local.hour >= 23) continue;

      const jitterMs = Math.floor(Math.random() * 60 * 60 * 1000);
      await this.weeklyPlanningQueue.add(
        'plan-week',
        { userId: u.id },
        {
          jobId: `week-plan-${u.id}-${local.toFormat('yyyy-WW')}`,
          delay: jitterMs,
          removeOnComplete: true,
          attempts: 2,
          backoff: { type: 'exponential', delay: 30000 },
        },
      );
      enqueued++;
    }

    if (enqueued > 0) {
      this.log.log(`Enqueued ${enqueued} weekly planning jobs`);
    }
  }
}
