import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq, isNotNull, lt, lte, or, sql } from 'drizzle-orm';
import { DateTime } from 'luxon';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  actionablesTable,
  usersTable,
  type ActionableRow,
} from '../database/schemas';

export type SnoozeUntil =
  | 'later_today'
  | 'tomorrow'
  | 'weekend'
  | 'next_week'
  | 'someday';

@Injectable()
export class ActionablesService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async wakeSnoozed(userId: string): Promise<void> {
    const now = new Date();
    await this.db
      .update(actionablesTable)
      .set({
        status: 'inbox',
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(actionablesTable.userId, userId),
          eq(actionablesTable.status, 'snoozed'),
          lte(actionablesTable.snoozedUntil, now),
        ),
      );
  }

  async findForUser(
    userId: string,
    id: string,
  ): Promise<ActionableRow | undefined> {
    const rows = await this.db
      .select()
      .from(actionablesTable)
      .where(
        and(eq(actionablesTable.id, id), eq(actionablesTable.userId, userId)),
      )
      .limit(1);
    return rows[0];
  }

  serialize(a: ActionableRow) {
    return {
      id: a.id,
      dump_id: a.dumpId,
      text: a.actionableText,
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
      draft_text: a.draftText,
      created_at: a.createdAt.toISOString(),
      updated_at: a.updatedAt.toISOString(),
    };
  }

  /**
   * Primary inbox feed (`GET /inbox`): all `inbox` actionables except idea-only rows.
   * Urgency is used for ordering only — extraction often sets `this_week` or `none`,
   * which previously hid items when we filtered to `urgency = 'today'` only.
   */
  async listToday(userId: string): Promise<ActionableRow[]> {
    const rows = await this.db
      .select()
      .from(actionablesTable)
      .where(
        and(
          eq(actionablesTable.userId, userId),
          eq(actionablesTable.status, 'inbox'),
          sql`${actionablesTable.tone} <> 'idea'`,
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
    this_week: ActionableRow[];
    someday: ActionableRow[];
    ideas: ActionableRow[];
    dismissed: ActionableRow[];
    batch_groups: { batch_key: string; items: ActionableRow[] }[];
  }> {
    const base = and(
      eq(actionablesTable.userId, userId),
      eq(actionablesTable.status, 'inbox'),
    );

    const thisWeek = await this.db
      .select()
      .from(actionablesTable)
      .where(
        and(
          base,
          eq(actionablesTable.urgency, 'this_week'),
          sql`${actionablesTable.tone} <> 'idea'`,
        ),
      )
      .orderBy(asc(actionablesTable.periodStart), asc(actionablesTable.dueAt));

    const somedayRows = await this.db
      .select()
      .from(actionablesTable)
      .where(
        and(
          base,
          sql`${actionablesTable.tone} <> 'idea'`,
          or(
            eq(actionablesTable.urgency, 'someday'),
            eq(actionablesTable.urgency, 'none'),
            eq(actionablesTable.tone, 'someday'),
          ),
        ),
      )
      .orderBy(desc(actionablesTable.createdAt));

    const ideas = await this.db
      .select()
      .from(actionablesTable)
      .where(and(base, eq(actionablesTable.tone, 'idea')))
      .orderBy(desc(actionablesTable.createdAt));

    const dismissed = await this.db
      .select()
      .from(actionablesTable)
      .where(
        and(
          eq(actionablesTable.userId, userId),
          eq(actionablesTable.status, 'dismissed'),
        ),
      )
      .orderBy(desc(actionablesTable.dismissedAt));

    const batchKeys = ['shopping', 'calls', 'emails', 'errands'] as const;
    const batch_groups: { batch_key: string; items: ActionableRow[] }[] = [];
    for (const bk of batchKeys) {
      const items = await this.db
        .select()
        .from(actionablesTable)
        .where(
          and(
            base,
            eq(actionablesTable.batchKey, bk),
            sql`${actionablesTable.tone} <> 'idea'`,
          ),
        )
        .orderBy(desc(actionablesTable.createdAt));
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
    };
  }

  async markDone(userId: string, id: string): Promise<ActionableRow> {
    await this.wakeSnoozed(userId);
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Actionable not found');
    const now = new Date();
    const [u] = await this.db
      .update(actionablesTable)
      .set({
        status: 'done',
        doneAt: now,
        dismissedAt: null,
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(
        and(eq(actionablesTable.id, id), eq(actionablesTable.userId, userId)),
      )
      .returning();
    if (!u) throw new NotFoundException('Actionable not found');
    return u;
  }

  async dismiss(userId: string, id: string): Promise<ActionableRow> {
    await this.wakeSnoozed(userId);
    const now = new Date();
    const [u] = await this.db
      .update(actionablesTable)
      .set({
        status: 'dismissed',
        dismissedAt: now,
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(
        and(eq(actionablesTable.id, id), eq(actionablesTable.userId, userId)),
      )
      .returning();
    if (!u) throw new NotFoundException('Actionable not found');
    return u;
  }

  async undone(userId: string, id: string): Promise<ActionableRow> {
    await this.wakeSnoozed(userId);
    const now = new Date();
    const [u] = await this.db
      .update(actionablesTable)
      .set({
        status: 'inbox',
        doneAt: null,
        updatedAt: now,
      })
      .where(
        and(eq(actionablesTable.id, id), eq(actionablesTable.userId, userId)),
      )
      .returning();
    if (!u) throw new NotFoundException('Actionable not found');
    return u;
  }

  async undismiss(userId: string, id: string): Promise<ActionableRow> {
    await this.wakeSnoozed(userId);
    const now = new Date();
    const [u] = await this.db
      .update(actionablesTable)
      .set({
        status: 'inbox',
        dismissedAt: null,
        updatedAt: now,
      })
      .where(
        and(eq(actionablesTable.id, id), eq(actionablesTable.userId, userId)),
      )
      .returning();
    if (!u) throw new NotFoundException('Actionable not found');
    return u;
  }

  async snooze(
    userId: string,
    id: string,
    until: SnoozeUntil,
    isoOverride?: string,
  ): Promise<ActionableRow> {
    await this.wakeSnoozed(userId);
    const row = await this.findForUser(userId, id);
    if (!row) throw new NotFoundException('Actionable not found');

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
      if (Number.isNaN(d.getTime())) {
        throw new BadRequestException('Invalid ISO date');
      }
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
      while (sat.weekday !== 6) {
        sat = sat.plus({ days: 1 });
      }
      const endSun = sat.plus({ days: 1 }).endOf('day');
      snoozedUntil = endSun.toJSDate();
      nextStatus = 'snoozed';
    } else if (until === 'next_week') {
      let m = now.startOf('day');
      while (m.weekday !== 1) {
        m = m.plus({ days: 1 });
      }
      if (m <= now.startOf('day')) {
        m = m.plus({ weeks: 1 });
      }
      snoozedUntil = m.toJSDate();
      nextStatus = 'snoozed';
    }

    const [u] = await this.db
      .update(actionablesTable)
      .set({
        status: nextStatus,
        snoozedUntil,
        urgency,
        updatedAt: new Date(),
      })
      .where(
        and(eq(actionablesTable.id, id), eq(actionablesTable.userId, userId)),
      )
      .returning();
    if (!u) throw new NotFoundException('Actionable not found');
    return u;
  }

  /**
   * All active work: `inbox` and `snoozed` (not done, not dismissed).
   * Newest first for pagination.
   */
  async listOpen(
    userId: string,
    limit: number,
    cursor: string | null,
  ): Promise<{ rows: ActionableRow[]; next_cursor: string | null }> {
    await this.wakeSnoozed(userId);
    const lim = Math.min(Math.max(limit, 1), 50);
    const base = and(
      eq(actionablesTable.userId, userId),
      or(
        eq(actionablesTable.status, 'inbox'),
        eq(actionablesTable.status, 'snoozed'),
      ),
    );
    const cur = cursor ? decodeOpenCursor(cursor) : null;
    const where = cur
      ? and(
          base,
          or(
            lt(actionablesTable.createdAt, cur.createdAt),
            and(
              eq(actionablesTable.createdAt, cur.createdAt),
              lt(actionablesTable.id, cur.id),
            ),
          ),
        )
      : base;

    const rows = await this.db
      .select()
      .from(actionablesTable)
      .where(where)
      .orderBy(desc(actionablesTable.createdAt), desc(actionablesTable.id))
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

  async listDone(
    userId: string,
    limit: number,
    cursor: string | null,
  ): Promise<{ rows: ActionableRow[]; next_cursor: string | null }> {
    await this.wakeSnoozed(userId);
    const lim = Math.min(Math.max(limit, 1), 50);
    const base = and(
      eq(actionablesTable.userId, userId),
      eq(actionablesTable.status, 'done'),
      isNotNull(actionablesTable.doneAt),
    );
    const cur = cursor ? decodeCursor(cursor) : null;
    const where = cur
      ? and(
          base,
          or(
            lt(actionablesTable.doneAt, cur.d),
            and(
              eq(actionablesTable.doneAt, cur.d),
              lt(actionablesTable.id, cur.id),
            ),
          ),
        )
      : base;

    const rows = await this.db
      .select()
      .from(actionablesTable)
      .where(where)
      .orderBy(desc(actionablesTable.doneAt), desc(actionablesTable.id))
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
    if (Number.isNaN(dt.getTime())) return null;
    return { d: dt, id: j.i };
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
    if (Number.isNaN(dt.getTime())) return null;
    return { createdAt: dt, id: j.i };
  } catch {
    return null;
  }
}
