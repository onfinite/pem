import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, lt, or, type SQL } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  memoryFactsTable,
  type MemoryFactRow,
  type MemoryStatus,
} from '../database/schemas';

function encodeMemoryCursor(learnedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ l: learnedAt.toISOString(), i: id }),
    'utf8',
  ).toString('base64url');
}

/** Cursor for `GET /users/me/profile?cursor=` (newest `learned_at` first). */
export function decodeMemoryCursor(raw: string): {
  learnedAt: Date;
  id: string;
} | null {
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      l?: string;
      i?: string;
      u?: string;
    };
    const iso = j.l ?? j.u;
    if (typeof iso !== 'string' || typeof j?.i !== 'string') return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return { learnedAt: d, id: j.i };
  } catch {
    return null;
  }
}

@Injectable()
export class ProfileRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  statusCondition(filter: 'active' | 'historical' | 'all'): SQL | undefined {
    if (filter === 'all') return undefined;
    return eq(memoryFactsTable.status, filter);
  }

  async listByUser(
    userId: string,
    status: 'active' | 'historical' | 'all' = 'all',
  ): Promise<MemoryFactRow[]> {
    const cond = this.statusCondition(status);
    const base = this.db
      .select()
      .from(memoryFactsTable)
      .where(
        cond
          ? and(eq(memoryFactsTable.userId, userId), cond)
          : eq(memoryFactsTable.userId, userId),
      );
    if (status === 'all') {
      return base.orderBy(desc(memoryFactsTable.learnedAt));
    }
    return base.orderBy(desc(memoryFactsTable.learnedAt));
  }

  async listByUserPaginated(
    userId: string,
    limit: number,
    cursor: { learnedAt: Date; id: string } | null,
    status: 'active' | 'historical' | 'all' = 'all',
  ): Promise<{ rows: MemoryFactRow[]; nextCursor: string | null }> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const parts: SQL[] = [eq(memoryFactsTable.userId, userId)];
    const st = this.statusCondition(status);
    if (st) parts.push(st);
    if (cursor) {
      parts.push(
        or(
          lt(memoryFactsTable.learnedAt, cursor.learnedAt),
          and(
            eq(memoryFactsTable.learnedAt, cursor.learnedAt),
            lt(memoryFactsTable.id, cursor.id),
          ),
        )!,
      );
    }
    const rows = await this.db
      .select()
      .from(memoryFactsTable)
      .where(and(...parts))
      .orderBy(desc(memoryFactsTable.learnedAt), desc(memoryFactsTable.id))
      .limit(lim + 1);
    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last ? encodeMemoryCursor(last.learnedAt, last.id) : null;
    return { rows: page, nextCursor };
  }

  /** Active facts only → one string per key (latest wins). */
  async getActiveMap(userId: string): Promise<Record<string, string>> {
    const rows = await this.db
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.userId, userId),
          eq(memoryFactsTable.status, 'active'),
        ),
      )
      .orderBy(desc(memoryFactsTable.learnedAt));
    const map: Record<string, string> = {};
    for (const r of rows) {
      if (!(r.memoryKey in map)) {
        map[r.memoryKey] = r.note;
      }
    }
    return map;
  }

  async getActiveByMemoryKey(
    userId: string,
    memoryKey: string,
  ): Promise<MemoryFactRow | undefined> {
    const rows = await this.db
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.userId, userId),
          eq(memoryFactsTable.memoryKey, memoryKey),
          eq(memoryFactsTable.status, 'active'),
        ),
      )
      .orderBy(desc(memoryFactsTable.learnedAt))
      .limit(1);
    return rows[0];
  }

  async markHistoricalForMemoryKey(
    userId: string,
    memoryKey: string,
  ): Promise<void> {
    await this.db
      .update(memoryFactsTable)
      .set({ status: 'historical' })
      .where(
        and(
          eq(memoryFactsTable.userId, userId),
          eq(memoryFactsTable.memoryKey, memoryKey),
          eq(memoryFactsTable.status, 'active'),
        ),
      );
  }

  async insertFact(row: {
    userId: string;
    memoryKey: string;
    note: string;
    learnedAt?: Date;
    sourceMessageId: string | null;
    status: MemoryStatus;
    provenance: string | null;
  }): Promise<MemoryFactRow> {
    const [created] = await this.db
      .insert(memoryFactsTable)
      .values({
        userId: row.userId,
        memoryKey: row.memoryKey,
        note: row.note,
        learnedAt: row.learnedAt ?? new Date(),
        sourceMessageId: row.sourceMessageId,
        status: row.status,
        provenance: row.provenance,
      })
      .returning();
    if (!created) {
      throw new Error('insert memory_facts failed');
    }
    return created;
  }

  async findByIdForUser(
    userId: string,
    id: string,
  ): Promise<MemoryFactRow | undefined> {
    const rows = await this.db
      .select()
      .from(memoryFactsTable)
      .where(
        and(eq(memoryFactsTable.userId, userId), eq(memoryFactsTable.id, id)),
      )
      .limit(1);
    return rows[0];
  }

  async countActiveWithKey(userId: string, memoryKey: string): Promise<number> {
    const rows = await this.db
      .select({ id: memoryFactsTable.id })
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.userId, userId),
          eq(memoryFactsTable.memoryKey, memoryKey),
          eq(memoryFactsTable.status, 'active'),
        ),
      );
    return rows.length;
  }

  async updateById(
    userId: string,
    id: string,
    patch: {
      memoryKey?: string;
      note?: string;
      status?: MemoryStatus;
    },
  ): Promise<MemoryFactRow | undefined> {
    const [row] = await this.db
      .update(memoryFactsTable)
      .set({
        ...(patch.memoryKey !== undefined
          ? { memoryKey: patch.memoryKey }
          : {}),
        ...(patch.note !== undefined ? { note: patch.note } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
      })
      .where(
        and(eq(memoryFactsTable.userId, userId), eq(memoryFactsTable.id, id)),
      )
      .returning();
    return row;
  }

  async deleteById(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(memoryFactsTable)
      .where(
        and(eq(memoryFactsTable.userId, userId), eq(memoryFactsTable.id, id)),
      )
      .returning();
    return rows.length > 0;
  }

  /** Most recent first; capped so extraction prompts stay bounded. */
  async listActiveNotesForPrompt(userId: string): Promise<MemoryFactRow[]> {
    return this.db
      .select()
      .from(memoryFactsTable)
      .where(
        and(
          eq(memoryFactsTable.userId, userId),
          eq(memoryFactsTable.status, 'active'),
        ),
      )
      .orderBy(desc(memoryFactsTable.learnedAt))
      .limit(120);
  }
}
