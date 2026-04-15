import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { extractsTable, listsTable, type ListRow } from '../database/schemas';

const DEFAULT_LISTS: { name: string; icon: string }[] = [
  { name: 'Shopping', icon: 'cart' },
  { name: 'Errands', icon: 'run' },
  { name: 'Ideas', icon: 'lightbulb' },
];

@Injectable()
export class ListsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findByUser(userId: string): Promise<ListRow[]> {
    return this.db
      .select()
      .from(listsTable)
      .where(eq(listsTable.userId, userId))
      .orderBy(listsTable.sortOrder);
  }

  async findByUserWithCounts(
    userId: string,
  ): Promise<(ListRow & { openCount: number })[]> {
    const rows = await this.db
      .select({
        list: listsTable,
        openCount: count(extractsTable.id),
      })
      .from(listsTable)
      .leftJoin(
        extractsTable,
        and(
          eq(extractsTable.listId, listsTable.id),
          ne(extractsTable.status, 'done'),
          ne(extractsTable.status, 'dismissed'),
        ),
      )
      .where(eq(listsTable.userId, userId))
      .groupBy(listsTable.id)
      .orderBy(listsTable.sortOrder);

    return rows.map((r) => ({ ...r.list, openCount: r.openCount }));
  }

  async findById(userId: string, listId: string): Promise<ListRow | null> {
    const [row] = await this.db
      .select()
      .from(listsTable)
      .where(and(eq(listsTable.id, listId), eq(listsTable.userId, userId)))
      .limit(1);
    return row ?? null;
  }

  async create(
    userId: string,
    data: { name: string; color?: string; icon?: string },
  ): Promise<ListRow> {
    const [row] = await this.db
      .insert(listsTable)
      .values({
        userId,
        name: data.name,
        color: data.color ?? null,
        icon: data.icon ?? null,
      })
      .returning();
    return row;
  }

  async update(
    userId: string,
    listId: string,
    data: { name?: string; color?: string; icon?: string; sortOrder?: number },
  ): Promise<ListRow> {
    const sets: Record<string, unknown> = { updatedAt: new Date() };
    if (data.name !== undefined) sets.name = data.name;
    if (data.color !== undefined) sets.color = data.color;
    if (data.icon !== undefined) sets.icon = data.icon;
    if (data.sortOrder !== undefined) sets.sortOrder = data.sortOrder;

    const [row] = await this.db
      .update(listsTable)
      .set(sets)
      .where(and(eq(listsTable.id, listId), eq(listsTable.userId, userId)))
      .returning();
    if (!row) throw new NotFoundException('List not found');
    return row;
  }

  async delete(userId: string, listId: string): Promise<void> {
    const list = await this.findById(userId, listId);
    if (!list) throw new NotFoundException('List not found');
    if (list.isDefault) {
      throw new BadRequestException('Cannot delete a default list');
    }

    await this.db
      .delete(extractsTable)
      .where(
        and(eq(extractsTable.listId, listId), eq(extractsTable.userId, userId)),
      );

    await this.db
      .delete(listsTable)
      .where(and(eq(listsTable.id, listId), eq(listsTable.userId, userId)));
  }

  async seedDefaults(userId: string): Promise<void> {
    const existing = await this.db
      .select({ id: listsTable.id, name: listsTable.name })
      .from(listsTable)
      .where(
        and(eq(listsTable.userId, userId), eq(listsTable.isDefault, true)),
      )
      .orderBy(listsTable.createdAt);

    const seen = new Map<string, string>();
    const dupeIds: string[] = [];
    for (const r of existing) {
      const key = r.name.toLowerCase();
      if (seen.has(key)) {
        dupeIds.push(r.id);
      } else {
        seen.set(key, r.id);
      }
    }
    if (dupeIds.length > 0) {
      await this.db
        .delete(listsTable)
        .where(inArray(listsTable.id, dupeIds));
    }

    const existingNames = new Set(seen.keys());
    const missing = DEFAULT_LISTS.filter(
      (l) => !existingNames.has(l.name.toLowerCase()),
    );

    if (missing.length === 0) return;

    const maxSort = seen.size;
    await this.db.insert(listsTable).values(
      missing.map((l, i) => ({
        userId,
        name: l.name,
        icon: l.icon,
        isDefault: true,
        sortOrder: maxSort + i,
      })),
    );
  }

  async resolveByName(userId: string, name: string): Promise<ListRow | null> {
    const [row] = await this.db
      .select()
      .from(listsTable)
      .where(
        and(
          eq(listsTable.userId, userId),
          sql`lower(${listsTable.name}) = lower(${name})`,
        ),
      )
      .limit(1);
    return row ?? null;
  }
}
