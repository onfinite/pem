import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { SplitAgent } from '../agents/split.agent';
import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  dumpsTable,
  prepsTable,
  usersTable,
  type PrepRow,
} from '../database/schemas';
import { PrepEventsService } from '../events/prep-events.service';
import { ProfileService } from '../profile/profile.service';

/**
 * Runs after POST /dumps: split transcript → prep rows → queue BullMQ prep jobs → SSE prep.created.
 */
@Injectable()
export class DumpSplitService {
  private readonly log = new Logger(DumpSplitService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly split: SplitAgent,
    private readonly profile: ProfileService,
    private readonly prepEvents: PrepEventsService,
    @InjectQueue('prep') private readonly prepQueue: Queue,
  ) {}

  async processDump(dumpId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(dumpsTable)
      .where(eq(dumpsTable.id, dumpId))
      .limit(1);
    const dump = rows[0];
    if (!dump) {
      throw new NotFoundException(`dump ${dumpId} not found`);
    }

    const thoughts = await this.split.splitTranscript(dump.transcript);
    const profileMap = await this.profile.getProfileMap(dump.userId);
    const [userRow] = await this.db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, dump.userId))
      .limit(1);
    const baseContext: Record<string, unknown> = {
      user: {
        name: userRow?.name ?? null,
        email: userRow?.email ?? null,
      },
      profile: profileMap,
    };

    await this.prepEvents.setPendingCount(dumpId, thoughts.length);

    if (thoughts.length === 0) {
      await this.prepEvents.publish(dumpId, { type: 'stream.done', dumpId });
      return;
    }

    for (const thought of thoughts) {
      const [prep] = await this.db
        .insert(prepsTable)
        .values({
          userId: dump.userId,
          dumpId: dump.id,
          title: thought.slice(0, 200),
          thought,
          context: baseContext,
          prepType: 'search',
          status: 'prepping',
        })
        .returning();

      await this.prepQueue.add(
        'process',
        { prepId: prep.id },
        {
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: true,
        },
      );

      await this.prepEvents.publish(dumpId, {
        type: 'prep.created',
        prep: this.prepEventPayload(prep),
      });
    }

    this.log.log(`dump ${dumpId} → ${thoughts.length} prep job(s) queued`);
  }

  private prepEventPayload(p: PrepRow) {
    return {
      id: p.id,
      thought: p.thought || p.title,
      status: p.status,
      render_type: p.renderType,
      summary: p.summary,
      result: p.result,
      created_at: p.createdAt.toISOString(),
    };
  }
}
