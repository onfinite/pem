import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, lt, or, type SQL } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { userProfileTable, type UserProfileRow } from '../database/schemas';

function encodeProfileCursor(updatedAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ u: updatedAt.toISOString(), i: id }),
    'utf8',
  ).toString('base64url');
}

/** Parse cursor from `GET /users/me/profile?cursor=` */
export function decodeProfileCursor(raw: string): {
  updatedAt: Date;
  id: string;
} | null {
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      u?: string;
      i?: string;
    };
    if (typeof j?.u !== 'string' || typeof j?.i !== 'string') return null;
    const d = new Date(j.u);
    if (Number.isNaN(d.getTime())) return null;
    return { updatedAt: d, id: j.i };
  } catch {
    return null;
  }
}

@Injectable()
export class ProfileRepository {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  /** All profile rows for settings / transparency UI. */
  async listByUser(userId: string): Promise<UserProfileRow[]> {
    return this.db
      .select()
      .from(userProfileTable)
      .where(eq(userProfileTable.userId, userId))
      .orderBy(asc(userProfileTable.key));
  }

  /**
   * Newest-updated first (then id) for paginated “What Pem knows”.
   * `cursor` is the last row from the previous page: (updatedAt, id) descending.
   */
  async listByUserPaginated(
    userId: string,
    limit: number,
    cursor: { updatedAt: Date; id: string } | null,
  ): Promise<{ rows: UserProfileRow[]; nextCursor: string | null }> {
    const lim = Math.min(Math.max(limit, 1), 50);
    const conditions: SQL[] = [eq(userProfileTable.userId, userId)];
    if (cursor) {
      conditions.push(
        or(
          lt(userProfileTable.updatedAt, cursor.updatedAt),
          and(
            eq(userProfileTable.updatedAt, cursor.updatedAt),
            lt(userProfileTable.id, cursor.id),
          ),
        )!,
      );
    }
    const rows = await this.db
      .select()
      .from(userProfileTable)
      .where(and(...conditions))
      .orderBy(desc(userProfileTable.updatedAt), desc(userProfileTable.id))
      .limit(lim + 1);
    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last && last.updatedAt
        ? encodeProfileCursor(last.updatedAt, last.id)
        : null;
    return { rows: page, nextCursor };
  }

  async getMap(userId: string): Promise<Record<string, string>> {
    const rows = await this.db
      .select()
      .from(userProfileTable)
      .where(eq(userProfileTable.userId, userId));
    const map: Record<string, string> = {};
    for (const r of rows) {
      map[r.key] = r.value;
    }
    return map;
  }

  async get(userId: string, key: string): Promise<string | null> {
    const rows = await this.db
      .select()
      .from(userProfileTable)
      .where(
        and(eq(userProfileTable.userId, userId), eq(userProfileTable.key, key)),
      )
      .limit(1);
    return rows[0]?.value ?? null;
  }

  async upsert(
    userId: string,
    key: string,
    value: string,
    source: string | null,
  ): Promise<void> {
    const now = new Date();
    await this.db
      .insert(userProfileTable)
      .values({
        userId,
        key,
        value,
        source,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userProfileTable.userId, userProfileTable.key],
        set: {
          value,
          source,
          updatedAt: now,
        },
      });
  }

  async findByIdForUser(
    userId: string,
    id: string,
  ): Promise<UserProfileRow | undefined> {
    const rows = await this.db
      .select()
      .from(userProfileTable)
      .where(
        and(eq(userProfileTable.userId, userId), eq(userProfileTable.id, id)),
      )
      .limit(1);
    return rows[0];
  }

  async findByUserAndKey(
    userId: string,
    key: string,
  ): Promise<UserProfileRow | undefined> {
    const rows = await this.db
      .select()
      .from(userProfileTable)
      .where(
        and(eq(userProfileTable.userId, userId), eq(userProfileTable.key, key)),
      )
      .limit(1);
    return rows[0];
  }

  async updateById(
    userId: string,
    id: string,
    patch: { key: string; value: string; source: string | null },
  ): Promise<UserProfileRow | undefined> {
    const now = new Date();
    const [row] = await this.db
      .update(userProfileTable)
      .set({
        key: patch.key,
        value: patch.value,
        source: patch.source,
        updatedAt: now,
      })
      .where(
        and(eq(userProfileTable.userId, userId), eq(userProfileTable.id, id)),
      )
      .returning();
    return row;
  }

  async deleteById(userId: string, id: string): Promise<boolean> {
    const rows = await this.db
      .delete(userProfileTable)
      .where(
        and(eq(userProfileTable.userId, userId), eq(userProfileTable.id, id)),
      )
      .returning();
    return rows.length > 0;
  }
}
