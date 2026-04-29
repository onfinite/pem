import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import { calendarConnectionsTable } from '@/database/schemas/index';
import { CalendarConnectionService } from '@/modules/calendar/calendar-connection.service';
import { CalendarSyncService } from '@/modules/calendar/calendar-sync.service';
import { logWithContext } from '@/core/utils/format-log-context';

const WATCH_RENEWAL_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CalendarCronService {
  private readonly log = new Logger(CalendarCronService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('calendar-sync') private readonly calendarQueue: Queue,
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

    this.log.log(
      logWithContext('Enqueuing Google Calendar sync jobs', {
        healthyConnections: healthy.length,
        scope: 'calendar_cron',
      }),
    );
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
      this.log.log(
        logWithContext('Auto-done past calendar events', {
          count,
          scope: 'calendar_cron',
        }),
      );
    }
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async renewExpiringWatches(): Promise<void> {
    const expiryThreshold = new Date(Date.now() + WATCH_RENEWAL_WINDOW_MS);
    const expiring =
      await this.connectionsSvc.findExpiringWatches(expiryThreshold);
    if (expiring.length === 0) return;

    this.log.log(
      logWithContext('Renewing expiring calendar watches', {
        count: expiring.length,
        scope: 'calendar_cron',
      }),
    );
    for (const conn of expiring) {
      try {
        await this.sync.renewWatch(conn.id);
      } catch (err) {
        this.log.warn(
          logWithContext('Watch renewal failed', {
            connectionId: conn.id,
            userId: conn.userId,
            scope: 'calendar_cron',
            err: err instanceof Error ? err.message : 'unknown',
          }),
        );
      }
    }
  }

  // Urgency auto-promotion removed — bucketing is now computed dynamically from period dates.
}
