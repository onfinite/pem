import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  lte,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import { DateTime } from 'luxon';

import { CalendarSyncService } from '../calendar/calendar-sync.service';
import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  extractsTable,
  logsTable,
  messagesTable,
  reportedIssuesTable,
  usersTable,
  type ExtractRow,
  type LogRow,
} from '../database/schemas';
import type { UpdateExtractBody } from './dto/update-extract.dto';
export type SnoozeUntil =
  | 'later_today'
  | 'tomorrow'
  | 'weekend'
  | 'next_week'
  | 'someday';

export type ExtractQueryFilters = {
  status?: 'open' | 'inbox' | 'snoozed' | 'dismissed' | 'done';
  batch_key?: string;
  tone?: string;
  exclude_tone?: string;
  urgency?: string;
};

/** When `'agent'`, skip user audit row — caller must log (e.g. dump pipeline `logEntry`). */
export type ExtractMutationAudit = { initiatedBy?: 'user' | 'agent' };

export type BriefBuckets = {
  overdue: ExtractRow[];
  today: ExtractRow[];
  tomorrow: ExtractRow[];
  this_week: ExtractRow[];
  next_week: ExtractRow[];
  later: ExtractRow[];
  batch_counts: { batch_key: string; count: number }[];
};

@Injectable()
export class ExtractsService {
  private readonly log = new Logger(ExtractsService.name);
  private readonly lastWake = new Map<string, number>();
  private static readonly WAKE_INTERVAL_MS = 60_000;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly calendarSync: CalendarSyncService,
  ) {}

  /** Compact row shape for activity / audit (GET …/history, debugging). */
  private extractStateSnapshot(r: ExtractRow): Record<string, unknown> {
    return {
      status: r.status,
      urgency: r.urgency,
      due_at: r.dueAt?.toISOString() ?? null,
      snoozed_until: r.snoozedUntil?.toISOString() ?? null,
      done_at: r.doneAt?.toISOString() ?? null,
      dismissed_at: r.dismissedAt?.toISOString() ?? null,
      batch_key: r.batchKey ?? null,
    };
  }

  private userEditSnapshot(r: ExtractRow): Record<string, unknown> {
    return {
      text: r.extractText,
      tone: r.tone,
      urgency: r.urgency,
      batch_key: r.batchKey ?? null,
      due_at: r.dueAt?.toISOString() ?? null,
      period_start: r.periodStart?.toISOString() ?? null,
      period_end: r.periodEnd?.toISOString() ?? null,
      period_label: r.periodLabel ?? null,
      duration_minutes: r.durationMinutes ?? null,
      pem_note: r.pemNote ?? null,
      is_deadline: r.isDeadline ?? false,
      energy_level: r.energyLevel ?? null,
    };
  }

  private async logUserChange(args: {
    userId: string;
    extractId: string;
    messageId?: string | null;
    op: string;
    payload?: Record<string, unknown>;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
  }): Promise<void> {
    const payload: Record<string, unknown> = {
      op: args.op,
      ...(args.payload ?? {}),
    };
    if (args.before) payload.before = args.before;
    if (args.after) payload.after = args.after;
    await this.db.insert(logsTable).values({
      userId: args.userId,
      type: 'extract',
      extractId: args.extractId,
      messageId: args.messageId ?? null,
      pemNote: null,
      isAgent: false,
      payload,
    });
  }

  async wakeSnoozed(userId: string): Promise<void> {
    const now = new Date();
    const woken = await this.db
      .update(extractsTable)
      .set({ status: 'inbox', snoozedUntil: null, updatedAt: now })
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.status, 'snoozed'),
          lte(extractsTable.snoozedUntil, now),
        ),
      )
      .returning({ id: extractsTable.id });

    for (const row of woken) {
      await this.db.insert(logsTable).values({
        userId,
        type: 'extract',
        extractId: row.id,
        pemNote: 'Auto-unsnoozed (snooze expired)',
        isAgent: true,
        payload: { op: 'auto_unsnooze' },
      });
    }
  }

  async wakeSnoozedThrottled(userId: string): Promise<void> {
    const last = this.lastWake.get(userId) ?? 0;
    if (Date.now() - last < ExtractsService.WAKE_INTERVAL_MS) return;
    this.lastWake.set(userId, Date.now());
    await this.wakeSnoozed(userId);
  }

  async findForUser(
    userId: string,
    id: string,
  ): Promise<ExtractRow | undefined> {
    const rows = await this.db
      .select()
      .from(extractsTable)
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .limit(1);
    return rows[0];
  }

  serialize(a: ExtractRow) {
    return {
      id: a.id,
      message_id: a.messageId,
      source: a.source ?? 'dump',
      text: a.extractText,
      original_text: a.originalText,
      status: a.status,
      tone: a.tone,
      urgency: a.urgency,
      batch_key: a.batchKey,
      due_at: a.dueAt?.toISOString() ?? null,
      period_start: a.periodStart?.toISOString() ?? null,
      period_end: a.periodEnd?.toISOString() ?? null,
      period_label: a.periodLabel,
      timezone_pending: a.timezonePending,
      snoozed_until: a.snoozedUntil?.toISOString() ?? null,
      done_at: a.doneAt?.toISOString() ?? null,
      dismissed_at: a.dismissedAt?.toISOString() ?? null,
      pem_note: a.pemNote,
      recommended_at: a.recommendedAt?.toISOString() ?? null,
      draft_text: a.draftText,
      event_start_at: a.eventStartAt?.toISOString() ?? null,
      event_end_at: a.eventEndAt?.toISOString() ?? null,
      event_location: a.eventLocation,
      external_event_id: a.externalEventId ?? null,
      is_organizer: a.isOrganizer ?? false,
      list_id: a.listId ?? null,
      priority: a.priority ?? null,
      reminder_at: a.reminderAt?.toISOString() ?? null,
      reminder_sent: a.reminderSent ?? false,
      scheduled_at: a.scheduledAt?.toISOString() ?? null,
      duration_minutes: a.durationMinutes ?? null,
      auto_scheduled: a.autoScheduled ?? false,
      scheduling_reason: a.schedulingReason ?? null,
      recurrence_rule: a.recurrenceRule ?? null,
      recurrence_parent_id: a.recurrenceParentId ?? null,
      rsvp_status: a.rsvpStatus ?? null,
      is_all_day: a.isAllDay ?? false,
      is_deadline: a.isDeadline ?? false,
      energy_level: a.energyLevel ?? null,
      meta: a.meta ?? {},
      created_at: a.createdAt.toISOString(),
      updated_at: a.updatedAt.toISOString(),
    };
  }

  async listToday(userId: string): Promise<ExtractRow[]> {
    const rows = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.status, 'inbox'),
          sql`${extractsTable.tone} <> 'idea'`,
        ),
      );

    const now = Date.now();
    const anchor = (r: ExtractRow): number =>
      r.scheduledAt?.getTime() ??
      r.eventStartAt?.getTime() ??
      r.dueAt?.getTime() ??
      r.periodStart?.getTime() ??
      Number.POSITIVE_INFINITY;

    return [...rows].sort((a, b) => {
      const aOver = a.dueAt != null && a.dueAt.getTime() < now ? 0 : 1;
      const bOver = b.dueAt != null && b.dueAt.getTime() < now ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const ad = anchor(a);
      const bd = anchor(b);
      if (ad !== bd) return ad - bd;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  async listAllForUser(userId: string): Promise<{
    dated: ExtractRow[];
    someday: ExtractRow[];
    ideas: ExtractRow[];
    dismissed: ExtractRow[];
    batch_groups: { batch_key: string; items: ExtractRow[] }[];
    batch_slots: { batch_key: string; items: ExtractRow[]; count: number }[];
  }> {
    const base = and(
      eq(extractsTable.userId, userId),
      eq(extractsTable.status, 'inbox'),
    );

    const allInbox = await this.db
      .select()
      .from(extractsTable)
      .where(and(base, sql`${extractsTable.tone} <> 'idea'`))
      .orderBy(asc(extractsTable.periodStart), asc(extractsTable.dueAt));

    const dated: ExtractRow[] = [];
    const somedayRows: ExtractRow[] = [];
    for (const r of allInbox) {
      const hasDate = r.periodStart || r.dueAt || r.eventStartAt || r.scheduledAt;
      if (r.urgency === 'someday' || !hasDate) {
        somedayRows.push(r);
      } else {
        dated.push(r);
      }
    }

    const ideas = await this.db
      .select()
      .from(extractsTable)
      .where(and(base, eq(extractsTable.tone, 'idea')))
      .orderBy(desc(extractsTable.createdAt));

    const dismissed = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.status, 'dismissed'),
        ),
      )
      .orderBy(desc(extractsTable.dismissedAt));

    const batchKeys = ['shopping', 'errands', 'follow_ups'] as const;
    const batch_groups: { batch_key: string; items: ExtractRow[] }[] = [];
    const batch_slots: {
      batch_key: string;
      items: ExtractRow[];
      count: number;
    }[] = [];

    for (const bk of batchKeys) {
      const items = await this.db
        .select()
        .from(extractsTable)
        .where(
          and(
            base,
            eq(extractsTable.batchKey, bk),
            sql`${extractsTable.tone} <> 'idea'`,
          ),
        )
        .orderBy(desc(extractsTable.createdAt));
      batch_slots.push({ batch_key: bk, items, count: items.length });
      if (items.length >= 2) {
        batch_groups.push({ batch_key: bk, items });
      }
    }

    return {
      dated,
      someday: somedayRows,
      ideas,
      dismissed,
      batch_groups,
      batch_slots,
    };
  }

  async listQuery(
    userId: string,
    filters: ExtractQueryFilters,
    limit: number,
    cursor: string | null,
  ): Promise<{ rows: ExtractRow[]; next_cursor: string | null }> {
    await this.wakeSnoozedThrottled(userId);
    const lim = Math.min(Math.max(limit, 1), 50);
    const parts: SQL[] = [eq(extractsTable.userId, userId)];

    const st = filters.status ?? 'open';
    if (st === 'open') {
      parts.push(ne(extractsTable.status, 'done'));
      parts.push(ne(extractsTable.status, 'dismissed'));
      parts.push(
        sql`not (${extractsTable.externalEventId} is not null and ${extractsTable.eventEndAt} is not null and ${extractsTable.eventEndAt} < now())`,
      );
    } else {
      parts.push(eq(extractsTable.status, st));
    }

    if (filters.batch_key)
      parts.push(eq(extractsTable.batchKey, filters.batch_key));
    if (filters.tone) parts.push(eq(extractsTable.tone, filters.tone));
    if (filters.exclude_tone)
      parts.push(ne(extractsTable.tone, filters.exclude_tone));
    if (filters.urgency) parts.push(eq(extractsTable.urgency, filters.urgency));

    const baseWhere = and(...parts)!;
    const cur = cursor ? decodeOpenCursor(cursor) : null;
    const where = cur
      ? and(
          baseWhere,
          or(
            lt(extractsTable.createdAt, cur.createdAt),
            and(
              eq(extractsTable.createdAt, cur.createdAt),
              lt(extractsTable.id, cur.id),
            ),
          ),
        )!
      : baseWhere;

    const rows = await this.db
      .select()
      .from(extractsTable)
      .where(where)
      .orderBy(desc(extractsTable.createdAt), desc(extractsTable.id))
      .limit(lim + 1);

    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    const last = page[page.length - 1];
    return {
      rows: page,
      next_cursor:
        hasMore && last ? encodeOpenCursor(last.createdAt, last.id) : null,
    };
  }

  async markDone(
    userId: string,
    id: string,
    audit?: ExtractMutationAudit,
  ): Promise<ExtractRow> {
    await this.wakeSnoozedThrottled(userId);
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');
    const now = new Date();
    const [u] = await this.db
      .update(extractsTable)
      .set({
        status: 'done',
        doneAt: now,
        dismissedAt: null,
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');
    if (audit?.initiatedBy !== 'agent') {
      await this.logUserChange({
        userId,
        extractId: id,
        messageId: row.messageId,
        op: 'mark_done',
        before: this.extractStateSnapshot(row),
        after: this.extractStateSnapshot(u),
      });
    }
    return u;
  }

  async dismiss(
    userId: string,
    id: string,
    audit?: ExtractMutationAudit,
  ): Promise<ExtractRow> {
    await this.wakeSnoozedThrottled(userId);
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');

    const now = new Date();
    const [u] = await this.db
      .update(extractsTable)
      .set({
        status: 'dismissed',
        dismissedAt: now,
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');

    if (audit?.initiatedBy !== 'agent') {
      await this.logUserChange({
        userId,
        extractId: id,
        messageId: row.messageId,
        op: 'dismiss',
        before: this.extractStateSnapshot(row),
        after: this.extractStateSnapshot(u),
      });
    }

    if (row.externalEventId && row.calendarConnectionId) {
      const isOwnEvent = row.isOrganizer || row.source !== 'calendar';
      if (isOwnEvent) {
        this.calendarSync
          .deleteFromGoogleCalendar(
            row.calendarConnectionId,
            row.externalEventId,
          )
          .catch((e) =>
            this.log.warn(
              `Calendar delete on dismiss failed extractId=${id}: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
      } else {
        this.calendarSync
          .rsvpOnGoogle(
            row.calendarConnectionId,
            row.externalEventId,
            'declined',
          )
          .catch((e) =>
            this.log.warn(
              `Calendar RSVP decline on dismiss failed extractId=${id}: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
      }
    }

    return u;
  }

  async undone(userId: string, id: string): Promise<ExtractRow> {
    await this.wakeSnoozedThrottled(userId);
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');
    const now = new Date();
    const [u] = await this.db
      .update(extractsTable)
      .set({ status: 'inbox', doneAt: null, updatedAt: now })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');
    await this.logUserChange({
      userId,
      extractId: id,
      messageId: row.messageId,
      op: 'undone',
      before: this.extractStateSnapshot(row),
      after: this.extractStateSnapshot(u),
    });
    return u;
  }

  async undismiss(userId: string, id: string): Promise<ExtractRow> {
    await this.wakeSnoozedThrottled(userId);
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');
    const now = new Date();
    const [u] = await this.db
      .update(extractsTable)
      .set({ status: 'inbox', dismissedAt: null, updatedAt: now })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');
    await this.logUserChange({
      userId,
      extractId: id,
      messageId: row.messageId,
      op: 'undismiss',
      before: this.extractStateSnapshot(row),
      after: this.extractStateSnapshot(u),
    });

    if (row.externalEventId && row.calendarConnectionId && !row.isOrganizer) {
      this.calendarSync
        .rsvpOnGoogle(
          row.calendarConnectionId,
          row.externalEventId,
          'accepted',
        )
        .catch((e) =>
          this.log.warn(
            `Calendar RSVP accept on undismiss failed extractId=${id}: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
    }

    return u;
  }

  async rsvp(
    userId: string,
    id: string,
    response: 'accepted' | 'declined' | 'tentative',
  ): Promise<ExtractRow> {
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');

    const now = new Date();
    const [u] = await this.db
      .update(extractsTable)
      .set({ rsvpStatus: response, updatedAt: now })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');

    if (row.externalEventId && row.calendarConnectionId) {
      this.calendarSync
        .rsvpOnGoogle(row.calendarConnectionId, row.externalEventId, response)
        .catch((e) =>
          this.log.warn(
            `Calendar RSVP ${response} failed extractId=${id}: ${e instanceof Error ? e.message : String(e)}`,
          ),
        );
    }

    if (response === 'declined') {
      await this.db
        .update(extractsTable)
        .set({ status: 'dismissed', dismissedAt: now })
        .where(eq(extractsTable.id, id));
    }

    return u;
  }

  async snooze(
    userId: string,
    id: string,
    until: SnoozeUntil,
    isoOverride?: string,
    audit?: ExtractMutationAudit,
  ): Promise<ExtractRow> {
    await this.wakeSnoozedThrottled(userId);
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');

    const [user] = await this.db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const zone = user?.timezone ?? 'UTC';

    const now = DateTime.now().setZone(zone);
    let snoozedUntil: Date | null = null;
    let nextStatus: 'inbox' | 'snoozed' = 'inbox';
    let urgency = row.urgency;

    if (until === 'someday') {
      urgency = 'someday';
      snoozedUntil = null;
      nextStatus = 'inbox';
    } else if (isoOverride) {
      const d = new Date(isoOverride);
      if (Number.isNaN(d.getTime()))
        throw new BadRequestException('Invalid ISO date');
      snoozedUntil = d;
      nextStatus = 'snoozed';
    } else if (until === 'later_today') {
      snoozedUntil = now.endOf('day').toJSDate();
      nextStatus = 'snoozed';
    } else if (until === 'tomorrow') {
      snoozedUntil = now.plus({ days: 1 }).endOf('day').toJSDate();
      nextStatus = 'snoozed';
    } else if (until === 'weekend') {
      let sat = now.startOf('day');
      while (sat.weekday !== 6) sat = sat.plus({ days: 1 });
      snoozedUntil = sat.plus({ days: 1 }).endOf('day').toJSDate();
      nextStatus = 'snoozed';
    } else if (until === 'next_week') {
      let m = now.startOf('day');
      while (m.weekday !== 1) m = m.plus({ days: 1 });
      if (m <= now.startOf('day')) m = m.plus({ weeks: 1 });
      snoozedUntil = m.toJSDate();
      nextStatus = 'snoozed';
    }

    const [u] = await this.db
      .update(extractsTable)
      .set({ status: nextStatus, snoozedUntil, urgency, updatedAt: new Date() })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');
    if (audit?.initiatedBy !== 'agent') {
      await this.logUserChange({
        userId,
        extractId: id,
        messageId: row.messageId,
        op: 'snooze',
        before: this.extractStateSnapshot(row),
        after: this.extractStateSnapshot(u),
        payload: {
          until,
          iso_override: isoOverride ?? null,
        },
      });
    }
    return u;
  }

  async updateExtract(
    userId: string,
    id: string,
    patch: UpdateExtractBody,
  ): Promise<ExtractRow> {
    await this.wakeSnoozedThrottled(userId);
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');
    if (row.status !== 'inbox' && row.status !== 'snoozed') {
      throw new BadRequestException('Only open or snoozed tasks can be edited');
    }

    const isCalendarEvent = !!row.externalEventId?.trim();
    const scheduleKeys: (keyof UpdateExtractBody)[] = [
      'due_at',
      'period_start',
      'period_end',
      'period_label',
      'duration_minutes',
      'is_deadline',
    ];
    const touchesSchedule = scheduleKeys.some((k) => patch[k] !== undefined);

    if (isCalendarEvent && touchesSchedule && !row.isOrganizer) {
      throw new BadRequestException(
        "This event was created by someone else and can't be rescheduled from here.",
      );
    }

    const now = new Date();
    const upd: Partial<typeof extractsTable.$inferInsert> = { updatedAt: now };

    if (patch.text !== undefined) upd.extractText = patch.text.trim();
    if (patch.original_text !== undefined)
      upd.originalText = patch.original_text.trim();
    if (patch.tone !== undefined) upd.tone = patch.tone;
    if (patch.urgency !== undefined) upd.urgency = patch.urgency;
    if (patch.batch_key !== undefined) upd.batchKey = patch.batch_key;
    if (patch.duration_minutes !== undefined)
      upd.durationMinutes = patch.duration_minutes;
    if (patch.pem_note !== undefined) upd.pemNote = patch.pem_note;
    if (patch.is_deadline !== undefined) upd.isDeadline = patch.is_deadline;
    if (patch.energy_level !== undefined) upd.energyLevel = patch.energy_level;
    if (patch.list_id !== undefined) upd.listId = patch.list_id;
    if (patch.priority !== undefined) upd.priority = patch.priority;
    if (patch.reminder_at !== undefined) {
      upd.reminderAt =
        patch.reminder_at === null ? null : new Date(patch.reminder_at);
      upd.reminderSent = false;
    }

    if (patch.due_at !== undefined) {
      upd.dueAt = patch.due_at === null ? null : new Date(patch.due_at);
    }
    if (patch.period_start !== undefined) {
      upd.periodStart =
        patch.period_start === null ? null : new Date(patch.period_start);
    }
    if (patch.period_end !== undefined) {
      upd.periodEnd =
        patch.period_end === null ? null : new Date(patch.period_end);
    }
    if (patch.period_label !== undefined)
      upd.periodLabel = patch.period_label;

    const [u] = await this.db
      .update(extractsTable)
      .set(upd)
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');

    if (isCalendarEvent && touchesSchedule && row.isOrganizer) {
      const calUpdates: { start?: Date; end?: Date } = {};
      if (upd.periodStart) calUpdates.start = upd.periodStart;
      if (upd.periodEnd) calUpdates.end = upd.periodEnd;
      if (row.calendarConnectionId && row.externalEventId) {
        await this.calendarSync.updateGoogleCalendarEvent(
          row.calendarConnectionId,
          row.externalEventId,
          calUpdates,
        );
      }
    }

    await this.logUserChange({
      userId,
      extractId: id,
      messageId: row.messageId,
      op: 'user_update',
      before: this.userEditSnapshot(row),
      after: this.userEditSnapshot(u),
      payload: {
        keys: Object.keys(patch).filter(
          (k) => patch[k as keyof UpdateExtractBody] !== undefined,
        ),
      },
    });
    return u;
  }

  async reschedule(
    userId: string,
    id: string,
    target: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'someday',
  ): Promise<ExtractRow> {
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');

    if (row.externalEventId?.trim()) {
      throw new BadRequestException(
        'This task is linked to Google Calendar — reschedule the event in Calendar or ask Pem.',
      );
    }

    const zone = await this.getUserTimezone(userId);
    const nowLux = DateTime.now().setZone(zone);

    let urgency: string = 'none';
    let dueAt: Date | null = row.dueAt;
    let periodStart: Date | null = null;
    let periodEnd: Date | null = null;
    let periodLabel: string | null = null;

    if (target === 'today') {
      periodStart = nowLux.startOf('day').toJSDate();
      periodEnd = nowLux.endOf('day').toJSDate();
      periodLabel = 'today';
    } else if (target === 'tomorrow') {
      const tom = nowLux.plus({ days: 1 });
      periodStart = tom.startOf('day').toJSDate();
      periodEnd = tom.endOf('day').toJSDate();
      periodLabel = 'tomorrow';
      dueAt = tom
        .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
        .toJSDate();
    } else if (target === 'this_week') {
      periodStart = nowLux.toJSDate();
      const sun = nowLux.plus({ days: 7 - nowLux.weekday });
      periodEnd = sun.endOf('day').toJSDate();
      periodLabel = 'this week';
    } else if (target === 'next_week') {
      let mon = nowLux.startOf('day');
      while (mon.weekday !== 1) mon = mon.plus({ days: 1 });
      if (mon <= nowLux.startOf('day')) mon = mon.plus({ weeks: 1 });
      periodStart = mon.toJSDate();
      periodEnd = mon.plus({ days: 6 }).endOf('day').toJSDate();
      periodLabel = 'next week';
    } else if (target === 'someday') {
      urgency = 'someday';
    }

    const [u] = await this.db
      .update(extractsTable)
      .set({
        status: 'inbox',
        urgency,
        dueAt,
        periodStart,
        periodEnd,
        periodLabel,
        snoozedUntil: null,
        updatedAt: new Date(),
      })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');

    await this.logUserChange({
      userId,
      extractId: id,
      messageId: row.messageId,
      op: 'reschedule',
      before: this.extractStateSnapshot(row),
      after: this.extractStateSnapshot(u),
      payload: { target },
    });
    return u;
  }

  async report(userId: string, id: string, reason: string): Promise<void> {
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');

    const extractSnapshot: Record<string, unknown> = {
      ...this.serialize(row),
      calendar_connection_id: row.calendarConnectionId,
    };

    let messageSnapshot: Record<string, unknown> | null = null;
    if (row.messageId) {
      const [m] = await this.db
        .select()
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.id, row.messageId),
            eq(messagesTable.userId, userId),
          ),
        )
        .limit(1);
      if (m) {
        messageSnapshot = {
          id: m.id,
          content: m.content,
          kind: m.kind,
          created_at: m.createdAt.toISOString(),
        };
      }
    }

    const [created] = await this.db
      .insert(reportedIssuesTable)
      .values({
        userId,
        extractId: id,
        messageId: row.messageId,
        reason,
        extractSnapshot,
        messageSnapshot,
      })
      .returning({ id: reportedIssuesTable.id });

    await this.logUserChange({
      userId,
      extractId: id,
      messageId: row.messageId,
      op: 'report',
      before: this.extractStateSnapshot(row),
      payload: {
        reason,
        reported_issue_id: created?.id ?? null,
      },
    });
  }

  async getTaskCounts(userId: string): Promise<{
    today: number;
    overdue: number;
    total_open: number;
    this_week: number;
    someday: number;
  }> {
    await this.wakeSnoozedThrottled(userId);
    const zone = await this.getUserTimezone(userId);
    const now = DateTime.now().setZone(zone);
    const todayStart = now.startOf('day').toJSDate();
    const todayEnd = now.endOf('day').toJSDate();
    const weekEnd = now
      .plus({ days: 7 - now.weekday })
      .endOf('day')
      .toJSDate();

    const jsNow = now.toJSDate();
    const anchor = sql`coalesce(${extractsTable.eventStartAt}, ${extractsTable.scheduledAt}, ${extractsTable.dueAt}, ${extractsTable.periodStart})`;
    const isPastCalEvent = sql`(${extractsTable.externalEventId} is not null and ${extractsTable.eventEndAt} is not null and ${extractsTable.eventEndAt} < ${jsNow})`;
    const overdueCondition = sql`(
      ${extractsTable.externalEventId} is null
      and ${anchor} is not null and ${anchor} < ${todayStart}
      and (
        (${extractsTable.periodEnd} is not null and ${extractsTable.periodEnd} < ${todayStart})
        or (${extractsTable.periodEnd} is null and ${extractsTable.dueAt} is not null and ${extractsTable.dueAt} < ${todayStart})
      )
    )`;
    const openFilter = and(
      eq(extractsTable.userId, userId),
      or(
        eq(extractsTable.status, 'inbox'),
        eq(extractsTable.status, 'snoozed'),
      ),
      sql`not (${isPastCalEvent})`,
    );

    const [counts] = await this.db
      .select({
        total_open: sql<number>`count(*)::int`,
        overdue: sql<number>`count(*) filter (where ${overdueCondition})::int`,
        today: sql<number>`count(*) filter (where not (${overdueCondition}) and ${anchor} >= ${todayStart} and ${anchor} <= ${todayEnd})::int`,
        this_week: sql<number>`count(*) filter (where ${anchor} > ${todayEnd} and ${anchor} <= ${weekEnd})::int`,
        someday: sql<number>`count(*) filter (where ${anchor} is null and ${extractsTable.urgency} = 'someday')::int`,
      })
      .from(extractsTable)
      .where(openFilter);

    return {
      today: counts?.today ?? 0,
      overdue: counts?.overdue ?? 0,
      total_open: counts?.total_open ?? 0,
      this_week: counts?.this_week ?? 0,
      someday: counts?.someday ?? 0,
    };
  }

  async getCalendarView(
    userId: string,
    monthStr: string | undefined,
  ): Promise<{
    items: ReturnType<typeof this.serialize>[];
    undated: ReturnType<typeof this.serialize>[];
    overdue: ReturnType<typeof this.serialize>[];
    dot_map: Record<string, { tasks: number; events: number }>;
  }> {
    await this.wakeSnoozedThrottled(userId);
    const zone = await this.getUserTimezone(userId);
    const now = DateTime.now().setZone(zone);

    // Parse month or default to current
    let monthDt: DateTime;
    if (monthStr && /^\d{4}-\d{2}$/.test(monthStr)) {
      monthDt = DateTime.fromFormat(monthStr, 'yyyy-MM', { zone });
    } else {
      monthDt = now.startOf('month');
    }

    // Range: first day of month - 7 days to last day of month + 7 days (cover week overflow)
    const rangeStart = monthDt.startOf('month').minus({ days: 7 }).toJSDate();
    const rangeEnd = monthDt.endOf('month').plus({ days: 7 }).toJSDate();
    const todayStart = now.startOf('day').toJSDate();

    const dateAnchor = sql`coalesce(${extractsTable.eventStartAt}, ${extractsTable.dueAt}, ${extractsTable.periodStart})`;
    const allOpen = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          or(
            eq(extractsTable.status, 'inbox'),
            eq(extractsTable.status, 'snoozed'),
          ),
          or(
            sql`${dateAnchor} is null`,
            sql`${dateAnchor} between ${rangeStart} and ${rangeEnd}`,
            lt(extractsTable.dueAt, todayStart),
            sql`(${extractsTable.periodStart} is not null and ${extractsTable.periodEnd} is not null and ${extractsTable.periodStart} <= ${rangeEnd} and ${extractsTable.periodEnd} >= ${rangeStart})`,
          ),
        ),
      )
      .orderBy(asc(extractsTable.createdAt))
      .limit(500);

    const items: ExtractRow[] = [];
    const undated: ExtractRow[] = [];
    const overdue: ExtractRow[] = [];
    const dotMap: Record<string, { tasks: number; events: number }> = {};

    const jsNow = now.toJSDate();

    for (const row of allOpen) {
      const isCalEvent = row.source === 'calendar' || !!row.externalEventId;
      if (isCalEvent && row.eventEndAt && row.eventEndAt < jsNow) continue;

      const anchor = row.eventStartAt ?? row.dueAt ?? row.periodStart;

      if (!anchor) {
        undated.push(row);
        continue;
      }

      const anchorDate = new Date(anchor);

      if (!isCalEvent) {
        const anchorBeforeToday = anchorDate < todayStart;
        if (anchorBeforeToday) {
          const periodEndDate = row.periodEnd ? new Date(row.periodEnd) : null;
          const isOd = periodEndDate
            ? periodEndDate < todayStart
            : anchorDate < todayStart;
          if (isOd) overdue.push(row);
        }
      }

      // Period items span multiple days; non-period items use the anchor
      const pStart = row.periodStart ? new Date(row.periodStart) : null;
      const pEnd = row.periodEnd ? new Date(row.periodEnd) : null;
      const hasPeriod = pStart && pEnd;

      // Include in items if anchor OR period overlaps the month range
      if (anchorDate >= rangeStart && anchorDate <= rangeEnd) {
        items.push(row);
      } else if (hasPeriod && pStart <= rangeEnd && pEnd >= rangeStart) {
        items.push(row);
      }

      // Build dot map — period items get a dot on each day in their range
      const isEvent = row.source === 'calendar';
      if (hasPeriod) {
        const cursor = DateTime.fromJSDate(
          pStart < rangeStart ? rangeStart : pStart,
        ).setZone(zone).startOf('day');
        const limit = DateTime.fromJSDate(
          pEnd > rangeEnd ? rangeEnd : pEnd,
        ).setZone(zone).startOf('day');
        let d = cursor;
        while (d <= limit) {
          const dk = d.toFormat('yyyy-MM-dd');
          if (!dotMap[dk]) dotMap[dk] = { tasks: 0, events: 0 };
          if (isEvent) dotMap[dk].events++;
          else dotMap[dk].tasks++;
          d = d.plus({ days: 1 });
        }
      } else {
        const dateKey = DateTime.fromJSDate(anchorDate)
          .setZone(zone)
          .toFormat('yyyy-MM-dd');
        if (!dotMap[dateKey]) dotMap[dateKey] = { tasks: 0, events: 0 };
        if (isEvent) dotMap[dateKey].events++;
        else dotMap[dateKey].tasks++;
      }
    }

    // Sort overdue by anchor date desc (most recent overdue first)
    overdue.sort((a, b) => {
      const aD = a.eventStartAt ?? a.dueAt ?? a.periodStart;
      const bD = b.eventStartAt ?? b.dueAt ?? b.periodStart;
      return (aD?.getTime() ?? 0) - (bD?.getTime() ?? 0);
    });

    return {
      items: items.map((r) => this.serialize(r)),
      undated: undated.map((r) => this.serialize(r)),
      overdue: overdue.map((r) => this.serialize(r)),
      dot_map: dotMap,
    };
  }

  async listOpen(
    userId: string,
    limit: number,
    cursor: string | null,
  ): Promise<{ rows: ExtractRow[]; next_cursor: string | null }> {
    await this.wakeSnoozedThrottled(userId);
    const lim = Math.min(Math.max(limit, 1), 50);
    const base = and(
      eq(extractsTable.userId, userId),
      or(
        eq(extractsTable.status, 'inbox'),
        eq(extractsTable.status, 'snoozed'),
      ),
      sql`not (${extractsTable.externalEventId} is not null and ${extractsTable.eventEndAt} is not null and ${extractsTable.eventEndAt} < now())`,
    );
    const cur = cursor ? decodeOpenCursor(cursor) : null;
    const where = cur
      ? and(
          base,
          or(
            lt(extractsTable.createdAt, cur.createdAt),
            and(
              eq(extractsTable.createdAt, cur.createdAt),
              lt(extractsTable.id, cur.id),
            ),
          ),
        )
      : base;

    const rows = await this.db
      .select()
      .from(extractsTable)
      .where(where)
      .orderBy(desc(extractsTable.createdAt), desc(extractsTable.id))
      .limit(lim + 1);

    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    const last = page[page.length - 1];
    return {
      rows: page,
      next_cursor:
        hasMore && last ? encodeOpenCursor(last.createdAt, last.id) : null,
    };
  }

  async getBrief(userId: string): Promise<BriefBuckets> {
    await this.wakeSnoozedThrottled(userId);
    const zone = await this.getUserTimezone(userId);
    const rows = await this.fetchExtractsForTimeline(userId, [
      'inbox',
      'snoozed',
    ]);
    return this.buildBriefBuckets(rows, zone);
  }

  /** Open actionable timeline for Ask Pem (inbox + snoozed), same bucketing as the daily brief. */
  async getAskOpenTimelineBuckets(userId: string): Promise<BriefBuckets> {
    await this.wakeSnoozedThrottled(userId);
    const zone = await this.getUserTimezone(userId);
    const rows = await this.fetchExtractsForTimeline(userId, [
      'inbox',
      'snoozed',
    ]);
    return this.buildBriefBuckets(rows, zone);
  }

  /** Every open shopping-tagged extract (any urgency), for shopping-list questions. */
  async getAskOpenShoppingExtracts(userId: string): Promise<ExtractRow[]> {
    await this.wakeSnoozedThrottled(userId);
    return this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.batchKey, 'shopping'),
          inArray(extractsTable.status, ['inbox', 'snoozed']),
        ),
      )
      .orderBy(asc(extractsTable.dueAt), desc(extractsTable.createdAt))
      .limit(200);
  }

  /** Done or dismissed rows when the user explicitly asks about completed or dismissed items. */
  async getAskClosedExtracts(
    userId: string,
    limit: number,
  ): Promise<ExtractRow[]> {
    const cap = Math.min(Math.max(limit, 1), 120);
    return this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          inArray(extractsTable.status, ['done', 'dismissed']),
        ),
      )
      .orderBy(desc(extractsTable.updatedAt))
      .limit(cap);
  }

  private async getUserTimezone(userId: string): Promise<string> {
    const [user] = await this.db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    return user?.timezone ?? 'UTC';
  }

  private async fetchExtractsForTimeline(
    userId: string,
    statuses: ('inbox' | 'snoozed')[],
  ): Promise<ExtractRow[]> {
    return this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          inArray(extractsTable.status, statuses),
        ),
      )
      .orderBy(asc(extractsTable.dueAt), desc(extractsTable.createdAt))
      .limit(500);
  }

  private buildBriefBuckets(rows: ExtractRow[], zone: string): BriefBuckets {
    const nowLux = DateTime.now().setZone(zone);
    const now = nowLux.toJSDate();
    const todayStart = nowLux.startOf('day').toJSDate();
    const todayEnd = nowLux.endOf('day').toJSDate();
    const tomorrowEnd = nowLux.plus({ days: 1 }).endOf('day').toJSDate();

    const daysToSunday = 7 - nowLux.weekday;
    const thisWeekEnd = nowLux
      .plus({ days: daysToSunday })
      .endOf('day')
      .toJSDate();
    const nextWeekEnd = nowLux
      .plus({ days: daysToSunday + 7 })
      .endOf('day')
      .toJSDate();

    const overdue: ExtractRow[] = [];
    const today: ExtractRow[] = [];
    const tomorrow: ExtractRow[] = [];
    const thisWeek: ExtractRow[] = [];
    const nextWeek: ExtractRow[] = [];
    const later: ExtractRow[] = [];

    for (const row of rows) {
      if (row.tone === 'idea') continue;
      if (row.urgency === 'someday') continue;

      const isCalEvent = row.source === 'calendar' || !!row.externalEventId;
      if (isCalEvent && row.eventEndAt && row.eventEndAt < now) continue;

      const anchor =
        row.status === 'snoozed' && row.snoozedUntil
          ? row.snoozedUntil
          : (row.scheduledAt ??
            row.eventStartAt ??
            row.dueAt ??
            row.periodStart ??
            null);

      const periodCoversToday =
        row.periodStart && row.periodEnd &&
        row.periodStart <= todayEnd && row.periodEnd >= todayStart;

      const anchorBeforeToday = anchor && anchor < todayStart;
      const isDueOverdue = !isCalEvent && anchorBeforeToday && row.dueAt && row.dueAt < todayStart;

      if (isDueOverdue) {
        overdue.push(row);
      } else if (periodCoversToday || (anchor && anchor <= todayEnd)) {
        today.push(row);
      } else if (anchor && anchor <= tomorrowEnd) {
        tomorrow.push(row);
      } else if (anchor && anchor <= thisWeekEnd) {
        thisWeek.push(row);
      } else if (anchor && anchor <= nextWeekEnd) {
        nextWeek.push(row);
      } else if (anchor) {
        later.push(row);
      }
      // Undated non-someday items are excluded from the brief (they appear in inbox only)
    }

    const sortByAnchor = (a: ExtractRow, b: ExtractRow) => {
      const getTime = (r: ExtractRow) =>
        r.status === 'snoozed' && r.snoozedUntil
          ? r.snoozedUntil.getTime()
          : (r.scheduledAt?.getTime() ??
            r.eventStartAt?.getTime() ??
            r.dueAt?.getTime() ??
            r.periodStart?.getTime() ??
            Infinity);
      return getTime(a) - getTime(b);
    };
    today.sort(sortByAnchor);
    tomorrow.sort(sortByAnchor);
    thisWeek.sort(sortByAnchor);
    nextWeek.sort(sortByAnchor);
    later.sort(sortByAnchor);

    const batchKeys = ['shopping', 'errands', 'follow_ups'] as const;
    const batch_counts = batchKeys.map((bk) => ({
      batch_key: bk,
      count: rows.filter((r) => r.batchKey === bk && r.tone !== 'idea').length,
    }));

    return {
      overdue,
      today,
      tomorrow,
      this_week: thisWeek,
      next_week: nextWeek,
      later,
      batch_counts,
    };
  }

  async getHistory(userId: string, extractId: string): Promise<LogRow[]> {
    return this.db
      .select()
      .from(logsTable)
      .where(
        and(eq(logsTable.userId, userId), eq(logsTable.extractId, extractId)),
      )
      .orderBy(desc(logsTable.createdAt))
      .limit(100);
  }

  async listDone(
    userId: string,
    limit: number,
    cursor: string | null,
  ): Promise<{ rows: ExtractRow[]; next_cursor: string | null }> {
    await this.wakeSnoozedThrottled(userId);
    const lim = Math.min(Math.max(limit, 1), 50);
    const base = and(
      eq(extractsTable.userId, userId),
      eq(extractsTable.status, 'done'),
      isNotNull(extractsTable.doneAt),
    );
    const cur = cursor ? decodeCursor(cursor) : null;
    const where = cur
      ? and(
          base,
          or(
            lt(extractsTable.doneAt, cur.d),
            and(eq(extractsTable.doneAt, cur.d), lt(extractsTable.id, cur.id)),
          ),
        )
      : base;

    const rows = await this.db
      .select()
      .from(extractsTable)
      .where(where)
      .orderBy(desc(extractsTable.doneAt), desc(extractsTable.id))
      .limit(lim + 1);

    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    const last = page[page.length - 1];
    return {
      rows: page,
      next_cursor:
        hasMore && last?.doneAt ? encodeCursor(last.doneAt, last.id) : null,
    };
  }
}

function encodeCursor(d: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ d: d.toISOString(), i: id }),
    'utf8',
  ).toString('base64url');
}

function decodeCursor(raw: string): { d: Date; id: string } | null {
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      d?: string;
      i?: string;
    };
    if (typeof j.d !== 'string' || typeof j.i !== 'string') return null;
    const dt = new Date(j.d);
    return Number.isNaN(dt.getTime()) ? null : { d: dt, id: j.i };
  } catch {
    return null;
  }
}

function encodeOpenCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ ca: createdAt.toISOString(), i: id }),
    'utf8',
  ).toString('base64url');
}

function decodeOpenCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      ca?: string;
      i?: string;
    };
    if (typeof j.ca !== 'string' || typeof j.i !== 'string') return null;
    const dt = new Date(j.ca);
    return Number.isNaN(dt.getTime()) ? null : { createdAt: dt, id: j.i };
  } catch {
    return null;
  }
}
