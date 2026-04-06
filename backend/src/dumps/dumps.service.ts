import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { dumpsTable, type UserRow } from '../database/schemas';

export const DUMP_TEXT_MAX_CHARS = 16_000;

@Injectable()
export class DumpsService {
  private readonly log = new Logger(DumpsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('dump') private readonly dumpQueue: Queue,
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

  async listDumpsForUser(userId: string) {
    return this.db
      .select()
      .from(dumpsTable)
      .where(eq(dumpsTable.userId, userId));
  }
}
