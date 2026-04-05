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
  isNotNull,
  lt,
  ne,
  or,
  sql,
  type SQL,
} from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  dumpsTable,
  prepRunLogsTable,
  prepsTable,
  type PrepRow,
  type PrepStatus,
} from '../database/schemas';

/** Hub list filter (`ready` = Inbox, `done` = Done bucket). */
export type PrepListStatus = PrepStatus;
import {
  LOCATION_PREP_QUEUE_DELAY_MS,
  prepIntentNeedsLocation,
} from '../agents/intents/location-intent';
import { parsePrepIntent } from '../agents/intents/prep-intent';
import { sanitizeShoppingProductUrl } from '../agents/schemas/shopping-product-url';
import type { ClientLocationHint } from '../events/prep-events.service';
import { PrepEventsService } from '../events/prep-events.service';
import { SerpApiService } from '../integrations/serpapi.service';
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

/** Max product rows on a shopping prep (3 hero + up to 7 compact in UI; no load-more). */
export const SHOPPING_PRODUCTS_MAX = 10;

@Injectable()
export class PrepsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly steps: StepsService,
    private readonly prepEvents: PrepEventsService,
    private readonly serp: SerpApiService,
    @InjectQueue('prep') private readonly prepQueue: Queue,
  ) {}

  /**
   * Paginated list: `status=prepping` includes **failed** (same hub bucket).
   * Optional `dumpId` scopes to one dump (e.g. post-dump screen).
   */
  async listForUserPaginated(
    userId: string,
    opts: {
      status?: PrepListStatus;
      /** Starred preps only (any status); takes precedence over `status`. */
      starredOnly?: boolean;
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

    if (opts.starredOnly) {
      conditions.push(isNotNull(prepsTable.starredAt));
    } else if (opts.status === 'prepping') {
      conditions.push(inArray(prepsTable.status, ['prepping', 'failed']));
    } else if (opts.status === 'ready') {
      conditions.push(eq(prepsTable.status, 'ready'));
    } else if (opts.status === 'done') {
      conditions.push(eq(prepsTable.status, 'done'));
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

  async listForUser(userId: string, status?: PrepListStatus) {
    if (status === 'prepping') {
      return this.db
        .select()
        .from(prepsTable)
        .where(
          and(
            eq(prepsTable.userId, userId),
            inArray(prepsTable.status, ['prepping', 'failed']),
          ),
        )
        .orderBy(desc(prepsTable.createdAt));
    }
    if (status === 'ready') {
      return this.db
        .select()
        .from(prepsTable)
        .where(
          and(eq(prepsTable.userId, userId), eq(prepsTable.status, 'ready')),
        )
        .orderBy(desc(prepsTable.createdAt));
    }
    if (status === 'done') {
      return this.db
        .select()
        .from(prepsTable)
        .where(
          and(eq(prepsTable.userId, userId), eq(prepsTable.status, 'done')),
        )
        .orderBy(desc(prepsTable.createdAt));
    }
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

  /** Exact counts for hub tabs (inbox ready / done / preparing+failed / archived / starred). */
  async countByTabBuckets(userId: string): Promise<{
    ready: number;
    done: number;
    preparing: number;
    archived: number;
    starred: number;
  }> {
    const [rReady] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(prepsTable)
      .where(
        and(eq(prepsTable.userId, userId), eq(prepsTable.status, 'ready')),
      );
    const [rDone] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(prepsTable)
      .where(and(eq(prepsTable.userId, userId), eq(prepsTable.status, 'done')));
    const [rPrep] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(prepsTable)
      .where(
        and(
          eq(prepsTable.userId, userId),
          inArray(prepsTable.status, ['prepping', 'failed']),
        ),
      );
    const [rArch] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(prepsTable)
      .where(
        and(eq(prepsTable.userId, userId), eq(prepsTable.status, 'archived')),
      );
    const [rStar] = await this.db
      .select({ c: sql<number>`count(*)::int` })
      .from(prepsTable)
      .where(
        and(eq(prepsTable.userId, userId), isNotNull(prepsTable.starredAt)),
      );
    return {
      ready: Number(rReady?.c ?? 0),
      done: Number(rDone?.c ?? 0),
      preparing: Number(rPrep?.c ?? 0),
      archived: Number(rArch?.c ?? 0),
      starred: Number(rStar?.c ?? 0),
    };
  }

  /**
   * Search substring across thought, title, summary, intent, result JSON, context JSON, and error text.
   * (Mid-sentence matches often live only in `result` / `context`, not in the short hub fields.)
   */
  async searchPrepsPaginated(
    userId: string,
    opts: {
      q: string;
      status: 'ready' | 'prepping' | 'archived' | 'done';
      limit: number;
      cursor?: string | null;
      starredOnly?: boolean;
    },
  ): Promise<{ rows: PrepRow[]; nextCursor: string | null }> {
    const lim = Math.min(Math.max(opts.limit, 1), 50);
    const conditions: SQL[] = [eq(prepsTable.userId, userId)];
    const escaped = opts.q
      .replace(/\\/g, '\\\\')
      .replace(/%/g, '\\%')
      .replace(/_/g, '\\_');
    const term = `%${escaped}%`;
    conditions.push(
      or(
        ilike(prepsTable.thought, term),
        ilike(prepsTable.title, term),
        ilike(prepsTable.summary, term),
        sql`coalesce(${prepsTable.intent}, '') ilike ${term} ESCAPE '\\'`,
        sql`coalesce(${prepsTable.result}::text, '') ilike ${term} ESCAPE '\\'`,
        sql`coalesce(${prepsTable.context}::text, '') ilike ${term} ESCAPE '\\'`,
        sql`coalesce(${prepsTable.errorMessage}, '') ilike ${term} ESCAPE '\\'`,
      )!,
    );
    if (opts.starredOnly) {
      conditions.push(isNotNull(prepsTable.starredAt));
    } else if (opts.status === 'prepping') {
      conditions.push(inArray(prepsTable.status, ['prepping', 'failed']));
    } else if (opts.status === 'ready') {
      conditions.push(eq(prepsTable.status, 'ready'));
    } else if (opts.status === 'done') {
      conditions.push(eq(prepsTable.status, 'done'));
    } else {
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

  /** Mark a ready prep done (`status: done` + `done_at`) or return it to Inbox. */
  async setDone(
    prepId: string,
    userId: string,
    done: boolean,
  ): Promise<PrepRow> {
    const prep = await this.getByIdForUser(prepId, userId);
    if (prep.status !== 'ready' && prep.status !== 'done') {
      throw new BadRequestException(
        'Only ready or done preps can be toggled for Inbox / Done',
      );
    }
    const now = new Date();
    const [updated] = await this.db
      .update(prepsTable)
      .set(
        done
          ? { status: 'done', doneAt: now }
          : { status: 'ready', doneAt: null },
      )
      .where(eq(prepsTable.id, prepId))
      .returning();
    if (!updated) {
      throw new NotFoundException('Prep not found');
    }
    return updated;
  }

  async setStarred(
    prepId: string,
    userId: string,
    starred: boolean,
  ): Promise<PrepRow> {
    await this.getByIdForUser(prepId, userId);
    const [updated] = await this.db
      .update(prepsTable)
      .set({ starredAt: starred ? new Date() : null })
      .where(and(eq(prepsTable.id, prepId), eq(prepsTable.userId, userId)))
      .returning();
    if (!updated) {
      throw new NotFoundException('Prep not found');
    }
    return updated;
  }

  /**
   * Ephemeral device location for the upcoming agent run (Redis — never persisted on `preps`).
   */
  async submitClientHints(
    prepId: string,
    userId: string,
    body: {
      latitude?: number;
      longitude?: number;
      locationUnavailable?: boolean;
    },
  ): Promise<{ ok: true }> {
    const prep = await this.getByIdForUser(prepId, userId);
    if (prep.status !== 'prepping') {
      throw new BadRequestException(
        'Location hints are only accepted while the prep is preparing',
      );
    }
    if (body.locationUnavailable === true) {
      await this.prepEvents.setClientLocationHint(prepId, {
        kind: 'unavailable',
      });
      return { ok: true };
    }
    const { latitude: lat, longitude: lng } = body;
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      throw new BadRequestException(
        'Send latitude and longitude together, or locationUnavailable: true',
      );
    }
    const hint: ClientLocationHint = {
      kind: 'coords',
      latitude: lat,
      longitude: lng,
    };
    await this.prepEvents.setClientLocationHint(prepId, hint);
    return { ok: true };
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

  /**
   * Prep row plus the parent dump transcript (detail screen — collapsed “original dump”).
   */
  async getByIdWithDumpTranscriptForUser(prepId: string, userId: string) {
    const rows = await this.db
      .select({
        prep: prepsTable,
        transcript: dumpsTable.transcript,
      })
      .from(prepsTable)
      .innerJoin(dumpsTable, eq(prepsTable.dumpId, dumpsTable.id))
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
        doneAt: null,
      })
      .where(eq(prepsTable.id, prepId))
      .returning();
    if (!updated) {
      throw new NotFoundException('Prep not found');
    }
    const intent = parsePrepIntent(prep.intent);
    const delayMs = prepIntentNeedsLocation(intent)
      ? LOCATION_PREP_QUEUE_DELAY_MS
      : 0;
    await this.prepQueue.add(
      'process',
      { prepId, dumpId: prep.dumpId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        ...(delayMs > 0 ? { delay: delayMs } : {}),
      },
    );
    await this.prepEvents.publish(prep.dumpId, {
      type: 'prep.created',
      dumpId: prep.dumpId,
      prep: {
        id: updated.id,
        thought: updated.thought || updated.title,
        intent: updated.intent ?? null,
        status: updated.status,
        prep_type: updated.prepType,
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
      prep.status !== 'done' &&
      prep.status !== 'prepping' &&
      prep.status !== 'failed'
    ) {
      throw new BadRequestException(
        'Only active preps (prepping, ready, done, or failed) can be archived',
      );
    }
    const now = new Date();
    const [updated] = await this.db
      .update(prepsTable)
      .set({
        status: 'archived',
        archivedAt: now,
        doneAt: null,
      })
      .where(eq(prepsTable.id, prepId))
      .returning();
    return updated;
  }

  /** Restore an archived prep to Inbox (clears Done — user re-marked complete from hub if they want). */
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
        doneAt: null,
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
          inArray(prepsTable.status, ['ready', 'done', 'archived']),
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

  /**
   * Keyword overlap with **other** dumps (same user, excluding the current dump).
   * Surfaces older raw transcripts so the agent can reuse context without inventing.
   */
  async relevantPastDumpsBlock(
    userId: string,
    excludeDumpId: string | null | undefined,
    thought: string,
    transcript: string,
    limit = 4,
  ): Promise<string> {
    if (!excludeDumpId) {
      return '';
    }
    const haystack = `${thought}\n${transcript}`.slice(0, 8_000);
    const tokens = haystack
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.replace(/[^a-z0-9]/gi, ''))
      .filter((w) => w.length > 2)
      .slice(0, 14);
    if (tokens.length === 0) {
      return '';
    }
    const tokenClause = or(
      ...tokens.map((t) => ilike(dumpsTable.transcript, `%${t}%`)),
    )!;
    const rows = await this.db
      .select({
        id: dumpsTable.id,
        transcript: dumpsTable.transcript,
        createdAt: dumpsTable.createdAt,
      })
      .from(dumpsTable)
      .where(
        and(
          eq(dumpsTable.userId, userId),
          ne(dumpsTable.id, excludeDumpId),
          tokenClause,
        ),
      )
      .orderBy(desc(dumpsTable.createdAt))
      .limit(limit);
    if (rows.length === 0) {
      return '';
    }
    const lines = rows.map((r) => {
      const when = r.createdAt.toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
      });
      const excerpt = r.transcript.replace(/\s+/g, ' ').trim().slice(0, 220);
      return `- (${when}) "${excerpt}${r.transcript.length > excerpt.length ? '…' : ''}"`;
    });
    return `Relevant older dumps (same user — raw text, may overlap this session):\n${lines.join('\n')}`;
  }

  /**
   * Append more shopping rows via Serp (Google Shopping + Amazon), deduped by URL, cap {@link SHOPPING_PRODUCTS_MAX}.
   */
  async appendShoppingProducts(
    userId: string,
    prepId: string,
    opts: { query?: string; batchSize?: number },
  ): Promise<PrepRow> {
    const prep = await this.getByIdForUser(prepId, userId);
    if (prep.status !== 'ready' && prep.status !== 'done') {
      throw new BadRequestException('Prep must be ready or done');
    }
    const r = prep.result;
    if (!r || r.schema !== 'SHOPPING_CARD') {
      throw new BadRequestException('Not a shopping prep');
    }
    if (!this.serp.hasKey()) {
      throw new BadRequestException('Product search is unavailable');
    }
    const rawProducts = Array.isArray(r.products) ? r.products : [];
    if (rawProducts.length >= SHOPPING_PRODUCTS_MAX) {
      throw new BadRequestException(
        `At most ${SHOPPING_PRODUCTS_MAX} products`,
      );
    }
    const batch = Math.min(
      opts.batchSize ?? 6,
      SHOPPING_PRODUCTS_MAX - rawProducts.length,
    );
    if (batch < 1) {
      throw new BadRequestException('No room for more products');
    }
    const searchQuery = (
      opts.query?.trim() ||
      (typeof r.query === 'string' ? r.query : '') ||
      prep.thought ||
      prep.title ||
      (typeof prep.summary === 'string' ? prep.summary : '') ||
      ''
    ).slice(0, 400);
    if (!searchQuery) {
      throw new BadRequestException('No search query');
    }
    const [googleRows, amazonRows] = await Promise.all([
      this.serp.googleShopping(searchQuery),
      this.serp.amazonSearch(searchQuery),
    ]);
    const merged = [...googleRows, ...amazonRows];
    const existingUrls = new Set<string>();
    for (const p of rawProducts) {
      if (p && typeof p === 'object' && 'url' in p) {
        const u = sanitizeShoppingProductUrl(
          String((p as { url: unknown }).url),
        );
        if (u) existingUrls.add(u);
      }
    }
    const newOnes: Record<string, unknown>[] = [];
    for (const row of merged) {
      if (newOnes.length >= batch) break;
      const url = sanitizeShoppingProductUrl(row.link);
      if (!url || existingUrls.has(url)) continue;
      existingUrls.add(url);
      newOnes.push({
        name: row.title.trim(),
        price: row.price.trim(),
        rating: Math.min(5, Math.max(0, row.rating)),
        image: row.thumbnail.trim(),
        url,
        store: row.source.trim(),
        why: '',
        badge: '',
        pros: [],
        cons: [],
      });
    }
    if (newOnes.length === 0) {
      throw new BadRequestException('No additional products found');
    }
    const prior = rawProducts as unknown[];
    const nextProducts = [...prior, ...newOnes].slice(0, SHOPPING_PRODUCTS_MAX);
    const nextResult = { ...r, products: nextProducts };
    const [updated] = await this.db
      .update(prepsTable)
      .set({ result: nextResult })
      .where(eq(prepsTable.id, prepId))
      .returning();
    if (!updated) {
      throw new NotFoundException('Prep not found');
    }
    return updated;
  }

  /** Hard-delete prep and cascaded rows (`agent_steps`, `prep_run_logs`). `memory_facts.source_prep_id` set null. */
  async deleteForUser(prepId: string, userId: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(prepsTable)
      .where(and(eq(prepsTable.id, prepId), eq(prepsTable.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      throw new NotFoundException('Prep not found');
    }
    const deleted = await this.db
      .delete(prepsTable)
      .where(and(eq(prepsTable.id, prepId), eq(prepsTable.userId, userId)))
      .returning({ id: prepsTable.id });
    if (deleted.length === 0) {
      throw new NotFoundException('Prep not found');
    }
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
