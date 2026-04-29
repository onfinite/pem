import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { and, eq, inArray, isNotNull, ne } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  extractsTable,
  usersTable,
  type RecurrenceRule,
} from '@/database/schemas/index';
import { logWithContext } from '@/core/utils/format-log-context';

@Injectable()
export class RecurrenceCronService {
  private readonly log = new Logger(RecurrenceCronService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** Daily at 2 AM: close missed open instances, then generate the next 7 days. */
  @Cron('0 2 * * *')
  async generateRecurrenceInstances(): Promise<void> {
    await this.closeStaleRecurrenceChildren();
    const parents = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          isNotNull(extractsTable.recurrenceRule),
          ne(extractsTable.status, 'closed'),
        ),
      );

    let created = 0;

    for (const parent of parents) {
      const rule = parent.recurrenceRule as RecurrenceRule;
      if (!rule?.freq) continue;

      const [userRow] = await this.db
        .select({ timezone: usersTable.timezone })
        .from(usersTable)
        .where(eq(usersTable.id, parent.userId))
        .limit(1);
      const tz = userRow?.timezone ?? 'UTC';

      const now = DateTime.now().setZone(tz);
      const horizon = now.plus({ days: 7 });

      const existingInstances = await this.db
        .select({
          scheduledAt: extractsTable.scheduledAt,
          dueAt: extractsTable.dueAt,
        })
        .from(extractsTable)
        .where(eq(extractsTable.recurrenceParentId, parent.id));

      const existingDates = new Set(
        existingInstances
          .map((i) => {
            const d = i.scheduledAt ?? i.dueAt;
            return d
              ? DateTime.fromJSDate(d).setZone(tz).toFormat('yyyy-MM-dd')
              : null;
          })
          .filter(Boolean),
      );

      const nextDates = this.computeNextOccurrences(rule, now, horizon);

      for (const date of nextDates) {
        const dateKey = date.toFormat('yyyy-MM-dd');
        if (existingDates.has(dateKey)) continue;

        if (rule.until) {
          const untilDt = DateTime.fromISO(rule.until, { zone: tz });
          if (date > untilDt) continue;
        }

        if (rule.count) {
          if (existingInstances.length >= rule.count) continue;
        }

        await this.db.insert(extractsTable).values({
          userId: parent.userId,
          messageId: parent.messageId,
          source: parent.source,
          extractText: parent.extractText,
          originalText: parent.originalText,
          status: 'inbox',
          tone: parent.tone,
          urgency: 'none',
          batchKey: parent.batchKey,
          dueAt: date.toJSDate(),
          periodStart: date.startOf('day').toJSDate(),
          periodEnd: date.endOf('day').toJSDate(),
          periodLabel: this.periodLabel(date, now),
          scheduledAt: parent.scheduledAt
            ? date
                .set({
                  hour: DateTime.fromJSDate(parent.scheduledAt).setZone(tz)
                    .hour,
                  minute: DateTime.fromJSDate(parent.scheduledAt).setZone(tz)
                    .minute,
                })
                .toJSDate()
            : null,
          durationMinutes: parent.durationMinutes,
          recurrenceParentId: parent.id,
          energyLevel: parent.energyLevel,
          updatedAt: new Date(),
        });
        created++;
      }
    }

    if (created > 0) {
      this.log.log(
        logWithContext('Created recurrence instances', {
          scope: 'cron.recurrence',
          created,
        }),
      );
    }
  }

  /** Inbox child instances whose window ended before today (user tz) — no guilt stack. */
  private async closeStaleRecurrenceChildren(): Promise<void> {
    const candidates = await this.db
      .select({
        id: extractsTable.id,
        userId: extractsTable.userId,
        periodEnd: extractsTable.periodEnd,
      })
      .from(extractsTable)
      .where(
        and(
          isNotNull(extractsTable.recurrenceParentId),
          eq(extractsTable.status, 'inbox'),
          isNotNull(extractsTable.periodEnd),
        ),
      );

    if (candidates.length === 0) return;

    const userIds = [...new Set(candidates.map((c) => c.userId))];
    const tzRows = await this.db
      .select({
        id: usersTable.id,
        timezone: usersTable.timezone,
      })
      .from(usersTable)
      .where(inArray(usersTable.id, userIds));

    const tzMap = new Map(
      tzRows.map((r) => [
        r.id,
        r.timezone && r.timezone.length > 0 ? r.timezone : 'UTC',
      ]),
    );

    const closedIds: string[] = [];
    for (const c of candidates) {
      const tz = tzMap.get(c.userId) ?? 'UTC';
      const todayStart = DateTime.now().setZone(tz).startOf('day');
      const end = DateTime.fromJSDate(c.periodEnd!, { zone: 'utc' }).setZone(
        tz,
      );
      if (end < todayStart) closedIds.push(c.id);
    }

    if (closedIds.length === 0) return;

    const now = new Date();
    await this.db
      .update(extractsTable)
      .set({
        status: 'closed',
        closedAt: now,
        updatedAt: now,
      })
      .where(inArray(extractsTable.id, closedIds));

    this.log.log(
      logWithContext('Closed stale recurrence instances', {
        scope: 'cron.recurrence',
        closedCount: closedIds.length,
      }),
    );
  }

  private computeNextOccurrences(
    rule: RecurrenceRule,
    from: DateTime,
    to: DateTime,
  ): DateTime[] {
    const dates: DateTime[] = [];
    let cursor = from.startOf('day');

    for (let i = 0; i < 365 && cursor <= to; i++) {
      let next: DateTime;

      if (rule.freq === 'daily') {
        next = cursor.plus({ days: rule.interval });
      } else if (rule.freq === 'weekly') {
        if (rule.by_day?.length) {
          for (const dow of rule.by_day) {
            let d = cursor;
            while (d.weekday !== dow) d = d.plus({ days: 1 });
            if (d >= from && d <= to) dates.push(d);
          }
          cursor = cursor.plus({ weeks: rule.interval });
          continue;
        }
        next = cursor.plus({ weeks: rule.interval });
      } else if (rule.freq === 'monthly') {
        next = rule.by_month_day
          ? cursor
              .set({ day: rule.by_month_day })
              .plus({ months: rule.interval })
          : cursor.plus({ months: rule.interval });
      } else {
        next = cursor.plus({ years: rule.interval });
      }

      cursor = next;
      if (cursor >= from && cursor <= to) {
        dates.push(cursor);
      }
    }

    return dates;
  }

  private periodLabel(date: DateTime, now: DateTime): string {
    const diffDays = date.diff(now, 'days').days;
    if (diffDays < 1) return 'today';
    if (diffDays < 2) return 'tomorrow';
    if (diffDays < 7) return 'this week';
    if (diffDays < 14) return 'next week';
    return date.toFormat('MMMM yyyy');
  }
}
