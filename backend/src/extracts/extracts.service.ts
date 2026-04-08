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
  logsTable,
  extractsTable,
  usersTable,
  type ExtractRow,
  type LogRow,
} from '../database/schemas';
import { CalendarSyncService } from '../calendar/calendar-sync.service';

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

@Injectable()
export class ExtractsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly calendarSync: CalendarSyncService,
  ) {}

  private async logUserChange(args: {
    userId: string;
    extractId: string;
    op: string;
    payload?: Record<string, unknown>;
  }): Promise<void> {
    await this.db.insert(logsTable).values({
      userId: args.userId,
      type: 'extract',
      extractId: args.extractId,
      dumpId: null,
      pemNote: null,
      isAgent: false,
      payload: { op: args.op, ...(args.payload ?? {}) },
    });
  }

  async wakeSnoozed(userId: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(extractsTable)
      .set({ status: 'inbox', snoozedUntil: null, updatedAt: now })
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.status, 'snoozed'),
          lte(extractsTable.snoozedUntil, now),
        ),
      );
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
      dump_id: a.dumpId,
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

  async markDone(userId: string, id: string): Promise<ExtractRow> {
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
    await this.logUserChange({ userId, extractId: id, op: 'mark_done' });
    return u;
  }

  /** Best-effort push to Google Calendar when an extract has a linked event. */
  private async syncExtractToCalendar(row: ExtractRow): Promise<void> {
    if (!row.calendarConnectionId || !row.externalEventId) return;
    try {
      await this.calendarSync.deleteFromGoogleCalendar(
        row.calendarConnectionId,
        row.externalEventId,
      );
    } catch {
      // best-effort — calendar sync failures should never block the user
    }
  }

  async dismiss(userId: string, id: string): Promise<ExtractRow> {
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

    await this.syncExtractToCalendar(row);
    await this.logUserChange({ userId, extractId: id, op: 'dismiss' });
    return u;
  }

  async undone(userId: string, id: string): Promise<ExtractRow> {
    await this.wakeSnoozed(userId);
    const now = new Date();
    const [u] = await this.db
      .update(extractsTable)
      .set({ status: 'inbox', doneAt: null, updatedAt: now })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');
    await this.logUserChange({ userId, extractId: id, op: 'undone' });
    return u;
  }

  async undismiss(userId: string, id: string): Promise<ExtractRow> {
    await this.wakeSnoozed(userId);
    const now = new Date();
    const [u] = await this.db
      .update(extractsTable)
      .set({ status: 'inbox', dismissedAt: null, updatedAt: now })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');
    await this.logUserChange({ userId, extractId: id, op: 'undismiss' });
    return u;
  }

  async snooze(
    userId: string,
    id: string,
    until: SnoozeUntil,
    isoOverride?: string,
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
    await this.logUserChange({
      userId,
      extractId: id,
      op: 'snooze',
      payload: {
        until,
        iso_override: isoOverride ?? null,
        snoozed_until: u.snoozedUntil?.toISOString() ?? null,
        status: u.status,
      },
    });
    return u;
  }

  async reschedule(
    userId: string,
    id: string,
    target: 'today' | 'this_week' | 'next_week' | 'someday',
  ): Promise<ExtractRow> {
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');

    const [u] = await this.db
      .update(extractsTable)
      .set({
        status: 'inbox',
        urgency: target === 'next_week' ? 'this_week' : target,
        snoozedUntil: null,
        updatedAt: new Date(),
      })
      .where(and(eq(extractsTable.id, id), eq(extractsTable.userId, userId)))
      .returning();
    if (!u) throw new NotFoundException('Extract not found');

    await this.logUserChange({
      userId,
      extractId: id,
      op: 'reschedule',
      payload: { target, new_urgency: u.urgency, new_status: u.status },
    });
    return u;
  }

  async report(userId: string, id: string, reason: string): Promise<void> {
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Extract not found');

    await this.logUserChange({
      userId,
      extractId: id,
      op: 'report',
      payload: { reason },
    });
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

  async getBrief(userId: string): Promise<{
    overdue: ExtractRow[];
    today: ExtractRow[];
    tomorrow: ExtractRow[];
    this_week: ExtractRow[];
    next_week: ExtractRow[];
    later: ExtractRow[];
    batch_counts: { batch_key: string; count: number }[];
  }> {
    await this.wakeSnoozed(userId);

    const [user] = await this.db
      .select({ timezone: usersTable.timezone })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const zone = user?.timezone ?? 'UTC';

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

    const allInbox = await this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          eq(extractsTable.status, 'inbox'),
        ),
      )
      .orderBy(asc(extractsTable.dueAt), desc(extractsTable.createdAt));

    const overdue: ExtractRow[] = [];
    const today: ExtractRow[] = [];
    const tomorrow: ExtractRow[] = [];
    const thisWeek: ExtractRow[] = [];
    const nextWeek: ExtractRow[] = [];
    const later: ExtractRow[] = [];

    for (const row of allInbox) {
      if (row.tone === 'idea') continue;

      const anchor = row.eventStartAt ?? row.dueAt ?? row.periodStart ?? null;

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
        (anchor && anchor <= thisWeekEnd)
      ) {
        thisWeek.push(row);
      } else if (anchor && anchor <= nextWeekEnd) {
        nextWeek.push(row);
      } else if (anchor) {
        later.push(row);
      } else if (row.urgency !== 'someday' && row.urgency !== 'none') {
        thisWeek.push(row);
      }
    }

    const sortByAnchor = (a: ExtractRow, b: ExtractRow) => {
      const aT = a.eventStartAt?.getTime() ?? a.dueAt?.getTime() ?? Infinity;
      const bT = b.eventStartAt?.getTime() ?? b.dueAt?.getTime() ?? Infinity;
      return aT - bT;
    };
    today.sort(sortByAnchor);
    tomorrow.sort(sortByAnchor);
    thisWeek.sort(sortByAnchor);
    nextWeek.sort(sortByAnchor);
    later.sort(sortByAnchor);

    const batchKeys = ['shopping', 'errands', 'follow_ups'] as const;
    const batch_counts = batchKeys.map((bk) => ({
      batch_key: bk,
      count: allInbox.filter((r) => r.batchKey === bk && r.tone !== 'idea')
        .length,
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
