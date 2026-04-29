import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { isNotNull } from 'drizzle-orm';
import { DateTime } from 'luxon';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import { usersTable } from '@/database/schemas/index';
import { logWithContext } from '@/core/utils/format-log-context';

@Injectable()
export class WeeklyPlanningCronService {
  private readonly log = new Logger(WeeklyPlanningCronService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('weekly-planning')
    private readonly weeklyPlanningQueue: Queue,
  ) {}

  /** Hourly: Sunday 6–11pm local → enqueue weekly reflection job per user. */
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
      this.log.log(
        logWithContext('Enqueued weekly planning jobs', {
          enqueued,
          scope: 'weekly_planning_cron',
        }),
      );
    }
  }
}
