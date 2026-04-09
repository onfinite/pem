import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, gte, lte, ne, or, isNotNull, asc } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  extractsTable,
  usersTable,
  type ExtractRow,
  type UserPreferences,
} from '../database/schemas';

export type TimeSlot = {
  start: DateTime;
  end: DateTime;
  durationMinutes: number;
  dayOfWeek: number;
  timeOfDay: 'morning' | 'afternoon' | 'evening';
};

export type ScoredSlot = TimeSlot & {
  score: number;
  reasons: string[];
};

export type PlacedBlock = {
  start: DateTime;
  end: DateTime;
  label: string;
};

export type ScheduledItem = {
  extractId: string;
  scheduledAt: DateTime;
  durationMinutes: number;
  reason: string;
};

@Injectable()
export class SchedulerService {
  private readonly log = new Logger(SchedulerService.name);

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findSlots(
    userId: string,
    params: {
      taskType: 'personal' | 'work' | 'errand' | 'focus' | 'meeting';
      durationMinutes: number;
      urgency: 'today' | 'this_week' | 'someday' | 'none';
      preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
      deadlineBefore?: DateTime;
      windowDays?: number;
    },
  ): Promise<ScoredSlot[]> {
    const { prefs, tz } = await this.loadUserContext(userId);
    const now = DateTime.now().setZone(tz);
    const windowEnd =
      params.deadlineBefore ?? now.plus({ days: params.windowDays ?? 7 });
    const free = await this.getFreeSlots(userId, now, windowEnd);

    return free
      .filter((s) => s.durationMinutes >= params.durationMinutes)
      .map((slot) => {
        let score = 0;
        const reasons: string[] = [];

        if (this.isAlignedWindow(slot, params.taskType, prefs)) {
          score += 3;
          reasons.push('aligned with preference');
        }

        if (slot.durationMinutes >= params.durationMinutes + 15) {
          score += 2;
          reasons.push('comfortable fit');
        } else {
          score += 1;
          reasons.push('tight fit');
        }

        if (params.urgency === 'today' && slot.start.hasSame(now, 'day')) {
          score += 2;
          reasons.push('same day (urgent)');
        }

        if (
          params.preferredTimeOfDay &&
          slot.timeOfDay === params.preferredTimeOfDay
        ) {
          score += 1;
          reasons.push('preferred time of day');
        }

        return { ...slot, score, reasons };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }

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

  async placeFocusBlocks(
    userId: string,
    weekStart: DateTime,
  ): Promise<PlacedBlock[]> {
    const [userRow] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (!userRow) return [];

    const targetHours = userRow.focusHoursPerWeek ?? 0;
    if (targetHours <= 0) return [];

    const prefs = (userRow.preferences as UserPreferences) ?? {};
    const prefTime = prefs.focus_time_pref ?? 'morning';
    const weekEnd = weekStart.plus({ days: 7 });

    const slots = await this.getFreeSlots(userId, weekStart, weekEnd);

    const focusSlots = slots
      .filter((s) => s.durationMinutes >= 60 && s.timeOfDay === prefTime)
      .sort((a, b) => b.durationMinutes - a.durationMinutes);

    const blocks: PlacedBlock[] = [];
    let remainingMinutes = targetHours * 60;

    for (const slot of focusSlots) {
      if (remainingMinutes <= 0) break;
      const blockMinutes = Math.min(
        slot.durationMinutes,
        120,
        remainingMinutes,
      );
      blocks.push({
        start: slot.start,
        end: slot.start.plus({ minutes: blockMinutes }),
        label: 'Focus Time',
      });
      remainingMinutes -= blockMinutes;
    }

    return blocks;
  }

  async autoScheduleWeek(
    userId: string,
    weekStart: DateTime,
  ): Promise<ScheduledItem[]> {
    const tz = (await this.loadUserContext(userId)).tz;
    const weekEnd = weekStart.plus({ days: 7 });

    const unscheduled = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.status, 'inbox'),
          or(
            eq(extractsTable.urgency, 'today'),
            eq(extractsTable.urgency, 'this_week'),
            eq(extractsTable.urgency, 'none'),
          ),
        ),
      )
      .orderBy(asc(extractsTable.dueAt));

    const toSchedule = unscheduled.filter(
      (r) => !r.scheduledAt && !r.eventStartAt,
    );

    const scheduled: ScheduledItem[] = [];
    for (const row of toSchedule) {
      const duration = row.durationMinutes ?? 30;
      const taskType = this.inferTaskType(row);
      const slots = await this.findSlots(userId, {
        taskType,
        durationMinutes: duration,
        urgency: row.urgency as 'today' | 'this_week' | 'someday' | 'none',
        deadlineBefore: row.dueAt
          ? DateTime.fromJSDate(row.dueAt).setZone(tz)
          : weekEnd,
      });

      if (slots.length === 0) continue;
      const best = slots[0];

      await this.db
        .update(extractsTable)
        .set({
          scheduledAt: best.start.toJSDate(),
          durationMinutes: duration,
          autoScheduled: true,
          schedulingReason: best.reasons.join(', '),
          updatedAt: new Date(),
        })
        .where(eq(extractsTable.id, row.id));

      scheduled.push({
        extractId: row.id,
        scheduledAt: best.start,
        durationMinutes: duration,
        reason: best.reasons.join(', '),
      });
    }

    return scheduled;
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
          ne(extractsTable.status, 'dismissed'),
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

    return rows
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

  private isAlignedWindow(
    slot: TimeSlot,
    taskType: string,
    prefs: UserPreferences,
  ): boolean {
    const workDays = prefs.work_days ?? [1, 2, 3, 4, 5];
    const isWorkDay = workDays.includes(slot.dayOfWeek);
    const personalWindows = prefs.personal_windows ?? ['evenings', 'weekends'];

    if (taskType === 'work' && isWorkDay && slot.timeOfDay !== 'evening')
      return true;
    if (
      taskType === 'personal' &&
      ((personalWindows.includes('evenings') && slot.timeOfDay === 'evening') ||
        (personalWindows.includes('weekends') && !isWorkDay))
    )
      return true;
    if (
      taskType === 'errand' &&
      ((prefs.errand_window === 'lunch' &&
        slot.start.hour >= 11 &&
        slot.start.hour <= 13) ||
        (prefs.errand_window === 'after_work' &&
          slot.timeOfDay === 'evening') ||
        (prefs.errand_window === 'weekend_morning' &&
          !isWorkDay &&
          slot.timeOfDay === 'morning'))
    )
      return true;
    if (taskType === 'focus' && prefs.focus_time_pref === slot.timeOfDay)
      return true;

    return false;
  }

  private inferTaskType(
    row: ExtractRow,
  ): 'personal' | 'work' | 'errand' | 'focus' | 'meeting' {
    if (row.batchKey === 'shopping' || row.batchKey === 'errands')
      return 'errand';
    if (row.batchKey === 'follow_ups') return 'meeting';
    const text = row.extractText.toLowerCase();
    if (text.match(/meet|call|sync|standup/)) return 'meeting';
    if (text.match(/pick up|drop off|pharmacy|grocery|errand/)) return 'errand';
    if (text.match(/write|research|plan|design|focus/)) return 'focus';
    return 'personal';
  }
}
