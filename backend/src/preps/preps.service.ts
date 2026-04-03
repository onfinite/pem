import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  lt,
  or,
  type SQL,
} from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  prepRunLogsTable,
  prepsTable,
  type PrepRow,
  type PrepStatus,
} from '../database/schemas';
import { PrepEventsService } from '../events/prep-events.service';
import { StepsService } from '../steps/steps.service';

function encodePrepCursor(createdAt: Date, id: string): string {
  return Buffer.from(
    JSON.stringify({ c: createdAt.toISOString(), i: id }),
    'utf8',
  ).toString('base64url');
}

function decodePrepCursor(raw: string): { c: Date; i: string } | null {
  try {
    const j = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8')) as {
      c?: string;
      i?: string;
    };
    if (typeof j?.c !== 'string' || typeof j?.i !== 'string') return null;
    const d = new Date(j.c);
    if (Number.isNaN(d.getTime())) return null;
    return { c: d, i: j.i };
  } catch {
    return null;
  }
}

@Injectable()
export class PrepsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly steps: StepsService,
    private readonly prepEvents: PrepEventsService,
    @InjectQueue('prep') private readonly prepQueue: Queue,
  ) {}

  /**
   * Paginated list: `status=prepping` includes **failed** (same hub bucket).
   * Optional `dumpId` scopes to one dump (e.g. post-dump screen).
   */
  async listForUserPaginated(
    userId: string,
    opts: {
      status?: PrepStatus;
      dumpId?: string;
      limit: number;
      cursor?: string | null;
    },
  ): Promise<{ rows: PrepRow[]; nextCursor: string | null }> {
    const lim = Math.min(Math.max(opts.limit, 1), 50);
    const conditions: SQL[] = [eq(prepsTable.userId, userId)];

    if (opts.dumpId) {
      conditions.push(eq(prepsTable.dumpId, opts.dumpId));
    }

    if (opts.status === 'prepping') {
      conditions.push(inArray(prepsTable.status, ['prepping', 'failed']));
    } else if (opts.status) {
      conditions.push(eq(prepsTable.status, opts.status));
    }

    if (opts.cursor) {
      const cur = decodePrepCursor(opts.cursor);
      if (!cur) {
        throw new BadRequestException('Invalid cursor');
      }
      conditions.push(
        or(
          lt(prepsTable.createdAt, cur.c),
          and(eq(prepsTable.createdAt, cur.c), lt(prepsTable.id, cur.i)),
        )!,
      );
    }

    const rows = await this.db
      .select()
      .from(prepsTable)
      .where(and(...conditions))
      .orderBy(desc(prepsTable.createdAt), desc(prepsTable.id))
      .limit(lim + 1);

    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    const last = page[page.length - 1];
    const nextCursor =
      hasMore && last && last.createdAt
        ? encodePrepCursor(last.createdAt, last.id)
        : null;

    return { rows: page, nextCursor };
  }

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

  async listAgentStepsForPrep(prepId: string, userId: string) {
    await this.getByIdForUser(prepId, userId);
    return this.steps.listForPrep(prepId);
  }

  async retry(prepId: string, userId: string) {
    const prep = await this.getByIdForUser(prepId, userId);
    if (prep.status !== 'failed') {
      throw new BadRequestException('Only failed preps can be retried');
    }
    await this.prepEvents.incrementPending(prep.dumpId);
    await this.steps.deleteForPrep(prepId);
    const [updated] = await this.db
      .update(prepsTable)
      .set({
        status: 'prepping',
        errorMessage: null,
        result: null,
        summary: null,
        readyAt: null,
      })
      .where(eq(prepsTable.id, prepId))
      .returning();
    if (!updated) {
      throw new NotFoundException('Prep not found');
    }
    await this.prepQueue.add(
      'process',
      { prepId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
      },
    );
    await this.prepEvents.publish(prep.dumpId, {
      type: 'prep.created',
      dumpId: prep.dumpId,
      prep: {
        id: updated.id,
        thought: updated.thought || updated.title,
        status: updated.status,
        render_type: updated.renderType,
        summary: updated.summary,
        result: updated.result,
        created_at: updated.createdAt.toISOString(),
      },
    });
    return updated;
  }

  async archive(prepId: string, userId: string) {
    const prep = await this.getByIdForUser(prepId, userId);
    if (prep.status === 'archived') {
      return prep;
    }
    if (
      prep.status !== 'ready' &&
      prep.status !== 'prepping' &&
      prep.status !== 'failed'
    ) {
      throw new BadRequestException(
        'Only active preps (prepping, ready, or failed) can be archived',
      );
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

  /** Restore an archived prep to Ready (user can reopen from the hub). */
  async unarchive(prepId: string, userId: string) {
    const prep = await this.getByIdForUser(prepId, userId);
    if (prep.status !== 'archived') {
      throw new BadRequestException('Only archived preps can be restored');
    }
    const [updated] = await this.db
      .update(prepsTable)
      .set({
        status: 'ready',
        archivedAt: null,
      })
      .where(eq(prepsTable.id, prepId))
      .returning();
    return updated;
  }

  /** Keyword overlap with past ready/archived preps (MVP relevance). */
  async relevantPastPrepsBlock(
    userId: string,
    thought: string,
    limit = 5,
  ): Promise<string> {
    const tokens = thought
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/gi, ''))
      .filter((w) => w.length > 2)
      .slice(0, 12);
    if (tokens.length === 0) {
      return '';
    }
    const tokenClause = or(
      ...tokens.map(
        (t) =>
          or(
            ilike(prepsTable.thought, `%${t}%`),
            ilike(prepsTable.summary, `%${t}%`),
          )!,
      ),
    )!;
    const rows = await this.db
      .select({
        id: prepsTable.id,
        thought: prepsTable.thought,
        summary: prepsTable.summary,
        createdAt: prepsTable.createdAt,
      })
      .from(prepsTable)
      .where(
        and(
          eq(prepsTable.userId, userId),
          inArray(prepsTable.status, ['ready', 'archived']),
          tokenClause,
        ),
      )
      .orderBy(desc(prepsTable.createdAt))
      .limit(limit);
    if (rows.length === 0) {
      return '';
    }
    const lines = rows.map((r) => {
      const title = (r.thought || 'Prep').slice(0, 80);
      const when = r.createdAt.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      });
      const sum = (r.summary || '').slice(0, 160);
      return `- "${title}" (${when})${sum ? ` — ${sum}` : ''}`;
    });
    return `Relevant past preps:\n${lines.join('\n')}`;
  }

  async markOpened(prepId: string, userId: string): Promise<PrepRow> {
    const prep = await this.getByIdForUser(prepId, userId);
    if (prep.openedAt) {
      return prep;
    }
    const now = new Date();
    const [updated] = await this.db
      .update(prepsTable)
      .set({ openedAt: now })
      .where(eq(prepsTable.id, prepId))
      .returning();
    if (!updated) {
      throw new NotFoundException('Prep not found');
    }
    return updated;
  }
}
