import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, lte, ne, or, isNotNull } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  extractsTable,
  usersTable,
  type UserPreferences,
} from '../database/schemas';
import { CalendarConnectionService } from '../calendar/calendar-connection.service';
import { GoogleCalendarService } from '../calendar/google-calendar.service';

export type TimeSlot = {
  start: DateTime;
  end: DateTime;
  durationMinutes: number;
  dayOfWeek: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
};

@Injectable()
export class SchedulerService {
  private readonly log = new Logger(SchedulerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly calendarConnections: CalendarConnectionService,
    private readonly googleCalendar: GoogleCalendarService,
  ) {}

  async getFreeSlots(
    userId: string,
    from: DateTime,
    to: DateTime,
  ): Promise<TimeSlot[]> {
    const { prefs } = await this.loadUserContext(userId);
    const busyBlocks = await this.getBusyBlocks(userId, from, to);
    const slots: TimeSlot[] = [];

    let cursor = from.startOf('day');
    const end = to.endOf('day');

    while (cursor < end) {
      const dayStart = this.getDayStart(cursor, prefs);
      const dayEnd = this.getDayEnd(cursor, prefs);

      if (dayStart >= dayEnd) {
        cursor = cursor.plus({ days: 1 });
        continue;
      }

      const dayBusy = busyBlocks
        .filter((b) => b.start < dayEnd && b.end > dayStart)
        .sort((a, b) => a.start.toMillis() - b.start.toMillis());

      let gapStart = dayStart < from ? from : dayStart;
      for (const busy of dayBusy) {
        if (busy.start > gapStart) {
          const mins = busy.start.diff(gapStart, 'minutes').minutes;
          if (mins >= 15) {
            slots.push(this.makeSlot(gapStart, busy.start));
          }
        }
        if (busy.end > gapStart) gapStart = busy.end;
      }

      if (dayEnd > gapStart) {
        const mins = dayEnd.diff(gapStart, 'minutes').minutes;
        if (mins >= 15) {
          slots.push(this.makeSlot(gapStart, dayEnd));
        }
      }

      cursor = cursor.plus({ days: 1 });
    }

    return slots;
  }

  async buildSchedulingContext(userId: string, tz: string): Promise<string> {
    const now = DateTime.now().setZone(tz);
    const weekEnd = now.plus({ days: 7 });
    const slots = await this.getFreeSlots(userId, now, weekEnd);

    if (slots.length === 0) return '';

    const byDay = new Map<string, TimeSlot[]>();
    for (const s of slots.slice(0, 10)) {
      const key = s.start.toFormat('cccc MMM d');
      if (!byDay.has(key)) byDay.set(key, []);
      byDay.get(key)!.push(s);
    }

    const lines: string[] = [];
    for (const [day, daySlots] of byDay) {
      const slotStrs = daySlots
        .map(
          (s) =>
            `  ${s.start.toFormat('h:mm a')} - ${s.end.toFormat('h:mm a')} (${Math.round((s.durationMinutes / 60) * 10) / 10}h)`,
        )
        .join('\n');
      lines.push(`${day}:\n${slotStrs}`);
    }

    return lines.join('\n');
  }

  private async loadUserContext(userId: string) {
    const [userRow] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    return {
      prefs: (userRow?.preferences as UserPreferences) ?? {},
      tz: userRow?.timezone ?? 'UTC',
    };
  }

  private async getBusyBlocks(
    userId: string,
    from: DateTime,
    to: DateTime,
  ): Promise<{ start: DateTime; end: DateTime }[]> {
    const rows = await this.db
      .select({
        eventStartAt: extractsTable.eventStartAt,
        eventEndAt: extractsTable.eventEndAt,
        scheduledAt: extractsTable.scheduledAt,
        durationMinutes: extractsTable.durationMinutes,
      })
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          ne(extractsTable.status, 'closed'),
          or(
            and(
              isNotNull(extractsTable.eventStartAt),
              gte(extractsTable.eventStartAt, from.toJSDate()),
              lte(extractsTable.eventStartAt, to.toJSDate()),
            ),
            and(
              isNotNull(extractsTable.scheduledAt),
              gte(extractsTable.scheduledAt, from.toJSDate()),
              lte(extractsTable.scheduledAt, to.toJSDate()),
            ),
          ),
        ),
      );

    const localBlocks = rows
      .map((r) => {
        if (r.eventStartAt && r.eventEndAt) {
          return {
            start: DateTime.fromJSDate(r.eventStartAt),
            end: DateTime.fromJSDate(r.eventEndAt),
          };
        }
        if (r.scheduledAt) {
          const dur = r.durationMinutes ?? 30;
          return {
            start: DateTime.fromJSDate(r.scheduledAt),
            end: DateTime.fromJSDate(r.scheduledAt).plus({ minutes: dur }),
          };
        }
        return null;
      })
      .filter((b): b is NonNullable<typeof b> => b !== null);

    const googleBlocks = await this.getGoogleBusyBlocks(userId, from, to);

    return [...localBlocks, ...googleBlocks];
  }

  private async getGoogleBusyBlocks(
    userId: string,
    from: DateTime,
    to: DateTime,
  ): Promise<{ start: DateTime; end: DateTime }[]> {
    try {
      const primary = await this.calendarConnections.getPrimary(userId);
      if (!primary || primary.provider !== 'google') return [];
      if (!primary.googleAccessToken || !primary.googleRefreshToken) return [];

      const result = await this.googleCalendar.queryFreeBusy(
        primary.googleAccessToken,
        primary.googleRefreshToken,
        from.toJSDate(),
        to.toJSDate(),
      );

      if (result.newAccessToken) {
        await this.calendarConnections.updateGoogleTokens(
          primary.id,
          result.newAccessToken,
          new Date(Date.now() + 3600_000),
        );
      }

      return result.busyBlocks.map((b) => ({
        start: DateTime.fromJSDate(b.start),
        end: DateTime.fromJSDate(b.end),
      }));
    } catch (e) {
      this.log.debug(
        `Google free/busy query failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return [];
    }
  }

  private getDayStart(day: DateTime, prefs: UserPreferences): DateTime {
    const workStart = prefs.work_hours?.start ?? '07:00';
    const [h, m] = workStart.split(':').map(Number);
    return day.set({ hour: h, minute: m, second: 0, millisecond: 0 });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private getDayEnd(day: DateTime, prefs: UserPreferences): DateTime {
    return day.set({ hour: 22, minute: 0, second: 0, millisecond: 0 });
  }

  private makeSlot(start: DateTime, end: DateTime): TimeSlot {
    const hour = start.hour;
    const timeOfDay: TimeSlot['timeOfDay'] =
      hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';
    return {
      start,
      end,
      durationMinutes: end.diff(start, 'minutes').minutes,
      dayOfWeek: start.weekday,
      timeOfDay,
    };
  }
}
