import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { dumpsTable, type UserRow } from '../database/schemas';

/** Max transcript length (chars); aligned with CreateDumpDto and client. */
export const DUMP_TRANSCRIPT_MAX_CHARS = 16_000;

@Injectable()
export class DumpsService {
  private readonly log = new Logger(DumpsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('dump') private readonly dumpQueue: Queue,
  ) {}

  async createDump(
    user: UserRow,
    transcript: string,
  ): Promise<{ status: string; dumpId: string; prepIds: string[] }> {
    const [dump] = await this.db
      .insert(dumpsTable)
      .values({
        userId: user.id,
        transcript: transcript.trim(),
      })
      .returning();

    await this.dumpQueue.add(
      'split',
      { dumpId: dump.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );

    this.log.log(`dump ${dump.id} queued for split for user ${user.id}`);
    return { status: 'got it', dumpId: dump.id, prepIds: [] };
  }

  async listDumpsForUser(userId: string) {
    return this.db
      .select()
      .from(dumpsTable)
      .where(eq(dumpsTable.userId, userId));
  }
}
