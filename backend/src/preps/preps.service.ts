import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  prepRunLogsTable,
  prepsTable,
  type PrepStatus,
} from '../database/schemas';

@Injectable()
export class PrepsService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async listForUser(userId: string, status?: PrepStatus) {
    if (status) {
      return this.db
        .select()
        .from(prepsTable)
        .where(
          and(eq(prepsTable.userId, userId), eq(prepsTable.status, status)),
        )
        .orderBy(desc(prepsTable.createdAt));
    }
    return this.db
      .select()
      .from(prepsTable)
      .where(eq(prepsTable.userId, userId))
      .orderBy(desc(prepsTable.createdAt));
  }

  async getByIdForUser(prepId: string, userId: string) {
    const rows = await this.db
      .select()
      .from(prepsTable)
      .where(and(eq(prepsTable.id, prepId), eq(prepsTable.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Prep not found');
    }
    return row;
  }

  async listLogsForPrep(prepId: string, userId: string) {
    await this.getByIdForUser(prepId, userId);
    return this.db
      .select()
      .from(prepRunLogsTable)
      .where(eq(prepRunLogsTable.prepId, prepId))
      .orderBy(asc(prepRunLogsTable.createdAt));
  }

  async archive(prepId: string, userId: string) {
    const prep = await this.getByIdForUser(prepId, userId);
    if (prep.status === 'archived') {
      return prep;
    }
    if (prep.status !== 'ready' && prep.status !== 'prepping') {
      throw new BadRequestException('Only active preps (prepping or ready) can be archived');
    }
    const now = new Date();
    const [updated] = await this.db
      .update(prepsTable)
      .set({
        status: 'archived',
        archivedAt: now,
      })
      .where(eq(prepsTable.id, prepId))
      .returning();
    return updated;
  }
}
