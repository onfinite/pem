import {
  BadRequestException,
  Injectable,
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
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

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

    const urgencyRank = (u: string): number =>
      u === 'today' ? 0 : u === 'this_week' ? 1 : u === 'someday' ? 2 : 3;

    const now = Date.now();
    return [...rows].sort((a, b) => {
      const aOver = a.dueAt != null && a.dueAt.getTime() < now ? 0 : 1;
      const bOver = b.dueAt != null && b.dueAt.getTime() < now ? 0 : 1;
      if (aOver !== bOver) return aOver - bOver;
      const ur = urgencyRank(a.urgency) - urgencyRank(b.urgency);
      if (ur !== 0) return ur;
      const ad = a.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      const bd = b.dueAt?.getTime() ?? Number.POSITIVE_INFINITY;
      if (ad !== bd) return ad - bd;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  }

  async listAllForUser(userId: string): Promise<{
    this_week: ExtractRow[];
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

    const thisWeek = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          base,
          eq(extractsTable.urgency, 'this_week'),
          sql`${extractsTable.tone} <> 'idea'`,
        ),
      )
      .orderBy(asc(extractsTable.periodStart), asc(extractsTable.dueAt));

    const somedayRows = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          base,
          sql`${extractsTable.tone} <> 'idea'`,
          eq(extractsTable.urgency, 'someday'),
        ),
      )
      .orderBy(desc(extractsTable.createdAt));

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
      this_week: thisWeek,
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
    await this.wakeSnoozed(userId);
    const lim = Math.min(Math.max(limit, 1), 50);
    const parts: SQL[] = [eq(extractsTable.userId, userId)];

    const st = filters.status ?? 'open';
    if (st === 'open') {
      parts.push(ne(extractsTable.status, 'done'));
      parts.push(ne(extractsTable.status, 'dismissed'));
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
    await this.wakeSnoozed(userId);
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
    await this.wakeSnoozed(userId);
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
    return u;
  }

  async undone(userId: string, id: string): Promise<ExtractRow> {
    await this.wakeSnoozed(userId);
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
    await this.wakeSnoozed(userId);
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
    return u;
  }

  async snooze(
    userId: string,
    id: string,
    until: SnoozeUntil,
    isoOverride?: string,
    audit?: ExtractMutationAudit,
  ): Promise<ExtractRow> {
    await this.wakeSnoozed(userId);
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

  async reschedule(
    userId: string,
    id: string,
    target: 'today' | 'tomorrow' | 'this_week' | 'next_week' | 'someday',
  ): Promise<ExtractRow> {
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');

    const zone = await this.getUserTimezone(userId);
    const nowLux = DateTime.now().setZone(zone);

    let urgency: ExtractRow['urgency'];
    let dueAt: Date | null = row.dueAt;

    if (target === 'tomorrow') {
      urgency = 'this_week';
      dueAt = nowLux
        .plus({ days: 1 })
        .set({ hour: 9, minute: 0, second: 0, millisecond: 0 })
        .toJSDate();
    } else if (target === 'next_week') {
      urgency = 'this_week';
      dueAt = row.dueAt;
    } else {
      urgency = target;
      dueAt = row.dueAt;
    }

    const [u] = await this.db
      .update(extractsTable)
      .set({
        status: 'inbox',
        urgency,
        dueAt,
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
    await this.wakeSnoozed(userId);
    const zone = await this.getUserTimezone(userId);
    const now = DateTime.now().setZone(zone);
    const todayStart = now.startOf('day').toJSDate();
    const todayEnd = now.endOf('day').toJSDate();

    const openRows = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          or(
            eq(extractsTable.status, 'inbox'),
            eq(extractsTable.status, 'snoozed'),
          ),
        ),
      );

    let today = 0;
    let overdue = 0;
    let thisWeek = 0;
    let someday = 0;

    for (const row of openRows) {
      const dueAt = row.dueAt ?? row.eventStartAt;
      if (dueAt) {
        const due = new Date(dueAt);
        if (due < todayStart) {
          overdue++;
        } else if (due <= todayEnd) {
          today++;
        } else {
          thisWeek++;
        }
      } else if (row.urgency === 'today') {
        today++;
      } else if (row.urgency === 'this_week') {
        thisWeek++;
      } else {
        someday++;
      }
    }

    return {
      today,
      overdue,
      total_open: openRows.length,
      this_week: thisWeek,
      someday,
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
    await this.wakeSnoozed(userId);
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

    // Fetch all open extracts for the user
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
        ),
      )
      .orderBy(asc(extractsTable.createdAt));

    const items: ExtractRow[] = [];
    const undated: ExtractRow[] = [];
    const overdue: ExtractRow[] = [];
    const dotMap: Record<string, { tasks: number; events: number }> = {};

    for (const row of allOpen) {
      const anchor = row.eventStartAt ?? row.dueAt ?? row.periodStart;

      if (!anchor) {
        undated.push(row);
        continue;
      }

      const anchorDate = new Date(anchor);

      // Overdue check
      if (anchorDate < todayStart) {
        overdue.push(row);
      }

      // Include in items if within the month range
      if (anchorDate >= rangeStart && anchorDate <= rangeEnd) {
        items.push(row);
      }

      // Build dot map for the displayed month
      const dateKey = DateTime.fromJSDate(anchorDate)
        .setZone(zone)
        .toFormat('yyyy-MM-dd');
      if (!dotMap[dateKey]) dotMap[dateKey] = { tasks: 0, events: 0 };
      if (row.source === 'calendar') {
        dotMap[dateKey].events++;
      } else {
        dotMap[dateKey].tasks++;
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
    await this.wakeSnoozed(userId);
    const lim = Math.min(Math.max(limit, 1), 50);
    const base = and(
      eq(extractsTable.userId, userId),
      or(
        eq(extractsTable.status, 'inbox'),
        eq(extractsTable.status, 'snoozed'),
      ),
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
    await this.wakeSnoozed(userId);
    const zone = await this.getUserTimezone(userId);
    const rows = await this.fetchExtractsForTimeline(userId, [
      'inbox',
      'snoozed',
    ]);
    return this.buildBriefBuckets(rows, zone);
  }

  /** Open actionable timeline for Ask Pem (inbox + snoozed), same bucketing as the daily brief. */
  async getAskOpenTimelineBuckets(userId: string): Promise<BriefBuckets> {
    await this.wakeSnoozed(userId);
    const zone = await this.getUserTimezone(userId);
    const rows = await this.fetchExtractsForTimeline(userId, [
      'inbox',
      'snoozed',
    ]);
    return this.buildBriefBuckets(rows, zone);
  }

  /** Every open shopping-tagged extract (any urgency), for shopping-list questions. */
  async getAskOpenShoppingExtracts(userId: string): Promise<ExtractRow[]> {
    await this.wakeSnoozed(userId);
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
      .orderBy(asc(extractsTable.dueAt), desc(extractsTable.createdAt));
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
      .orderBy(asc(extractsTable.dueAt), desc(extractsTable.createdAt));
  }

  private buildBriefBuckets(rows: ExtractRow[], zone: string): BriefBuckets {
    const nowLux = DateTime.now().setZone(zone);
    const now = nowLux.toJSDate();
    const todayEnd = nowLux.endOf('day').toJSDate();
    const tomorrowEnd = nowLux.plus({ days: 1 }).endOf('day').toJSDate();

    const weekday = nowLux.weekday;
    const daysToSunday = 7 - weekday;
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

      const anchor =
        row.status === 'snoozed' && row.snoozedUntil
          ? row.snoozedUntil
          : (row.scheduledAt ??
            row.eventStartAt ??
            row.dueAt ??
            row.periodStart ??
            null);

      const bucketEnd = row.periodEnd ?? anchor;

      const isDueOverdue = row.dueAt && row.dueAt < now;
      const isEventOverdue =
        row.eventEndAt && row.eventEndAt < now && row.source === 'calendar';

      if (isDueOverdue || isEventOverdue) {
        overdue.push(row);
      } else if (
        row.urgency === 'today' ||
        (anchor && anchor <= todayEnd && anchor >= now)
      ) {
        today.push(row);
      } else if (anchor && anchor <= tomorrowEnd) {
        tomorrow.push(row);
      } else if (
        row.urgency === 'this_week' ||
        (bucketEnd && bucketEnd <= thisWeekEnd)
      ) {
        thisWeek.push(row);
      } else if (bucketEnd && bucketEnd <= nextWeekEnd) {
        nextWeek.push(row);
      } else if (anchor) {
        later.push(row);
      } else if (row.urgency !== 'someday' && row.urgency !== 'none') {
        thisWeek.push(row);
      }
    }

    const sortByAnchor = (a: ExtractRow, b: ExtractRow) => {
      const getTime = (r: ExtractRow) =>
        r.status === 'snoozed' && r.snoozedUntil
          ? r.snoozedUntil.getTime()
          : (r.scheduledAt?.getTime() ??
            r.eventStartAt?.getTime() ??
            r.dueAt?.getTime() ??
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
      .orderBy(desc(logsTable.createdAt));
  }

  async listDone(
    userId: string,
    limit: number,
    cursor: string | null,
  ): Promise<{ rows: ExtractRow[]; next_cursor: string | null }> {
    await this.wakeSnoozed(userId);
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
