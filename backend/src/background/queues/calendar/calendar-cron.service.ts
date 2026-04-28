import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq, isNotNull } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import { calendarConnectionsTable, usersTable } from '@/database/schemas/index';
import { CalendarConnectionService } from '@/calendar/calendar-connection.service';
import { CalendarSyncService } from '@/calendar/calendar-sync.service';

const WATCH_RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CalendarCronService {
  private readonly log = new Logger(CalendarCronService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('calendar-sync') private readonly calendarQueue: Queue,
    @InjectQueue('weekly-planning')
    private readonly weeklyPlanningQueue: Queue,
    private readonly connectionsSvc: CalendarConnectionService,
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

  @Cron(CronExpression.EVERY_6_HOURS)
  async renewExpiringWatches(): Promise<void> {
    const expiryThreshold = new Date(Date.now() + WATCH_RENEWAL_WINDOW_MS);
    const expiring =
      await this.connectionsSvc.findExpiringWatches(expiryThreshold);
    if (expiring.length === 0) return;

    this.log.log(`Renewing ${expiring.length} expiring calendar watches`);
    for (const conn of expiring) {
      try {
        await this.sync.renewWatch(conn.id);
      } catch (err) {
        this.log.warn(
          `Watch renewal failed for ${conn.id}: ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
    }
  }

  // Urgency auto-promotion removed — bucketing is now computed dynamically from period dates.

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
