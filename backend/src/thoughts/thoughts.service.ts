import { Injectable, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { actionablesTable, dumpsTable } from '../database/schemas';
import { ActionablesService } from '../actionables/actionables.service';

/**
 * Thoughts API: each entry is one dump session. `id` is the dump UUID.
 * Display text prefers AI `polished_text`, falls back to raw dump text.
 */
@Injectable()
export class ThoughtsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly actionables: ActionablesService,
  ) {}

  async listForUser(
    userId: string,
    limit: number,
    cursor: string | null,
  ): Promise<{
    thoughts: {
      id: string;
      dump_id: string;
      text: string;
      created_at: string;
      actionable_count: number;
    }[];
    next_cursor: string | null;
  }> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const cur = cursor ? decodeDumpCursor(cursor) : null;
    const base = eq(dumpsTable.userId, userId);
    const where = cur
      ? and(
          base,
          or(
            lt(dumpsTable.createdAt, cur.createdAt),
            and(
              eq(dumpsTable.createdAt, cur.createdAt),
              lt(dumpsTable.id, cur.id),
            ),
          ),
        )
      : base;

    const rows = await this.db
      .select({
        id: dumpsTable.id,
        dumpText: dumpsTable.dumpText,
        polishedText: dumpsTable.polishedText,
        createdAt: dumpsTable.createdAt,
      })
      .from(dumpsTable)
      .where(where)
      .orderBy(desc(dumpsTable.createdAt), desc(dumpsTable.id))
      .limit(lim + 1);

    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    const last = page[page.length - 1];

    const thoughts: {
      id: string;
      dump_id: string;
      text: string;
      created_at: string;
      actionable_count: number;
    }[] = [];

    for (const r of page) {
      const [cnt] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(actionablesTable)
        .where(eq(actionablesTable.dumpId, r.id));
      const display = r.polishedText?.trim() || r.dumpText;
      thoughts.push({
        id: r.id,
        dump_id: r.id,
        text: display,
        created_at: r.createdAt.toISOString(),
        actionable_count: cnt?.c ?? 0,
      });
    }

    return {
      thoughts,
      next_cursor:
        hasMore && last ? encodeDumpCursor(last.createdAt, last.id) : null,
    };
  }

  async getById(userId: string, dumpId: string) {
    const rows = await this.db
      .select()
      .from(dumpsTable)
      .where(and(eq(dumpsTable.id, dumpId), eq(dumpsTable.userId, userId)))
      .limit(1);
    const dump = rows[0];
    if (!dump) {
      throw new NotFoundException('Thought not found');
    }

    const items = await this.db
      .select()
      .from(actionablesTable)
      .where(eq(actionablesTable.dumpId, dump.id));

    const display = dump.polishedText?.trim() || dump.dumpText;

    return {
      thought: {
        id: dump.id,
        dump_id: dump.id,
        text: display,
        raw_text: dump.dumpText,
        polished_text: dump.polishedText,
        created_at: dump.createdAt.toISOString(),
      },
      actionables: items.map((a) => this.actionables.serialize(a)),
    };
  }
}

function encodeDumpCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ c: createdAt.toISOString(), i: id }),
    'utf8',
  ).toString('base64url');
}

function decodeDumpCursor(raw: string): { createdAt: Date; id: string } | null {
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      c?: string;
      i?: string;
    };
    if (typeof j.c !== 'string' || typeof j.i !== 'string') return null;
    const d = new Date(j.c);
    if (Number.isNaN(d.getTime())) return null;
    return { createdAt: d, id: j.i };
  } catch {
    return null;
  }
}
