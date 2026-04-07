import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { ActionablesService } from '../actionables/actionables.service';
import {
  actionablesTable,
  dumpsTable,
  type UserRow,
} from '../database/schemas';

export const DUMP_TEXT_MAX_CHARS = 16_000;

@Injectable()
export class DumpsService {
  private readonly log = new Logger(DumpsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('dump') private readonly dumpQueue: Queue,
    private readonly actionables: ActionablesService,
  ) {}

  async createDump(user: UserRow, text: string): Promise<{ dumpId: string }> {
    const trimmed = text.trim();
    const [dump] = await this.db
      .insert(dumpsTable)
      .values({
        userId: user.id,
        dumpText: trimmed,
      })
      .returning();

    await this.dumpQueue.add(
      'extract',
      { dumpId: dump.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );

    this.log.log(`dump ${dump.id} queued for extraction for user ${user.id}`);
    return { dumpId: dump.id };
  }

  /**
   * Paginated dump sessions for the hub. Display text prefers `polished_text`, else raw dump text.
   */
  async listPaginated(
    userId: string,
    limit: number,
    cursor: string | null,
  ): Promise<{
    dumps: {
      id: string;
      text: string;
      status: string;
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
        status: dumpsTable.status,
        createdAt: dumpsTable.createdAt,
      })
      .from(dumpsTable)
      .where(where)
      .orderBy(desc(dumpsTable.createdAt), desc(dumpsTable.id))
      .limit(lim + 1);

    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    const last = page[page.length - 1];

    const dumps: {
      id: string;
      text: string;
      status: string;
      created_at: string;
      actionable_count: number;
    }[] = [];

    for (const r of page) {
      const [cnt] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(actionablesTable)
        .where(eq(actionablesTable.dumpId, r.id));
      const display = r.polishedText?.trim() || r.dumpText;
      dumps.push({
        id: r.id,
        text: display,
        status: r.status,
        created_at: r.createdAt.toISOString(),
        actionable_count: cnt?.c ?? 0,
      });
    }

    return {
      dumps,
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
      throw new NotFoundException('Dump not found');
    }

    const items = await this.db
      .select()
      .from(actionablesTable)
      .where(eq(actionablesTable.dumpId, dump.id));

    const display = dump.polishedText?.trim() || dump.dumpText;

    return {
      dump: {
        id: dump.id,
        text: display,
        status: dump.status,
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
