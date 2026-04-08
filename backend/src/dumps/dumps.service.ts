import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { ExtractsService } from '../extracts/extracts.service';
import { StorageService } from '../storage/storage.service';
import { TranscriptionService } from '../transcription/transcription.service';
import {
  extractsTable,
  dumpsTable,
  logsTable,
  type UserRow,
} from '../database/schemas';

export const DUMP_TEXT_MAX_CHARS = 16_000;

@Injectable()
export class DumpsService {
  private readonly log = new Logger(DumpsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('dump') private readonly dumpQueue: Queue,
    private readonly extracts: ExtractsService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly transcription: TranscriptionService,
  ) {}

  async createDump(user: UserRow, text: string): Promise<{ dumpId: string }> {
    const trimmed = text.trim();
    const [dump] = await this.db
      .insert(dumpsTable)
      .values({ userId: user.id, dumpText: trimmed })
      .returning();

    await this.dumpQueue.add(
      'extract',
      { dumpId: dump.id },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    );

    this.log.log(`dump ${dump.id} queued for extraction for user ${user.id}`);
    return { dumpId: dump.id };
  }

  /** Re-queue extraction after a final pipeline failure. */
  async retryExtraction(userId: string, dumpId: string): Promise<{ ok: true }> {
    const rows = await this.db
      .select({
        id: dumpsTable.id,
        status: dumpsTable.status,
      })
      .from(dumpsTable)
      .where(and(eq(dumpsTable.id, dumpId), eq(dumpsTable.userId, userId)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundException('Dump not found');
    if (row.status !== 'failed') {
      throw new BadRequestException('Only failed dumps can be retried');
    }

    await this.db
      .update(dumpsTable)
      .set({ status: 'processing', lastError: null })
      .where(eq(dumpsTable.id, dumpId));

    await this.dumpQueue.add(
      'extract',
      { dumpId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 200 },
      },
    );

    this.log.log(`dump ${dumpId} retry queued for user ${userId}`);
    return { ok: true };
  }

  async transcribeAudio(audio: Express.Multer.File): Promise<string> {
    return this.transcription.transcribe(audio);
  }

  async createFromVoice(
    user: UserRow,
    audio: Express.Multer.File,
  ): Promise<{ dumpId: string; text: string }> {
    const text = await this.transcribeAudio(audio);
    const result = await this.createDump(user, text);

    if (this.storage.enabled && audio.buffer) {
      const key = `dumps/${result.dumpId}/audio.m4a`;
      this.storage
        .upload(key, audio.buffer, audio.mimetype || 'audio/m4a')
        .then(() =>
          this.db
            .update(dumpsTable)
            .set({ audioKey: key })
            .where(eq(dumpsTable.id, result.dumpId)),
        )
        .catch((err) =>
          this.log.warn(
            `Audio upload failed for dump ${result.dumpId}: ${err instanceof Error ? err.message : 'unknown'}`,
          ),
        );
    }

    return { dumpId: result.dumpId, text };
  }

  async uploadAudioForDump(
    dumpId: string,
    audio: Express.Multer.File,
  ): Promise<void> {
    if (!this.storage.enabled || !audio.buffer) return;
    const key = `dumps/${dumpId}/audio.m4a`;
    await this.storage.upload(key, audio.buffer, audio.mimetype || 'audio/m4a');
    await this.db
      .update(dumpsTable)
      .set({ audioKey: key })
      .where(eq(dumpsTable.id, dumpId));
  }

  async getAudioUrl(userId: string, dumpId: string): Promise<string | null> {
    const rows = await this.db
      .select({ audioKey: dumpsTable.audioKey })
      .from(dumpsTable)
      .where(and(eq(dumpsTable.id, dumpId), eq(dumpsTable.userId, userId)))
      .limit(1);
    const key = rows[0]?.audioKey;
    if (!key) return null;
    return this.storage.getSignedUrl(key);
  }

  async listPaginated(
    userId: string,
    limit: number,
    cursor: string | null,
  ): Promise<{
    dumps: {
      id: string;
      text: string;
      status: string;
      last_error: string | null;
      created_at: string;
      extract_count: number;
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

    const dumpIds = page.map((r) => r.id);
    const countMap = new Map<string, number>();
    if (dumpIds.length > 0) {
      const counts = await this.db
        .select({
          dumpId: extractsTable.dumpId,
          c: sql<number>`count(*)::int`,
        })
        .from(extractsTable)
        .where(inArray(extractsTable.dumpId, dumpIds))
        .groupBy(extractsTable.dumpId);
      for (const row of counts) {
        if (row.dumpId) countMap.set(row.dumpId, row.c);
      }
    }

    const dumps = page.map((r) => ({
      id: r.id,
      text: r.polishedText?.trim() || r.dumpText,
      status: r.status,
      /** Never expose server/LLM errors to clients (stored in DB for ops only). */
      last_error: null,
      created_at: r.createdAt.toISOString(),
      extract_count: countMap.get(r.id) ?? 0,
    }));

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
    if (!dump) throw new NotFoundException('Dump not found');

    const items = await this.db
      .select()
      .from(extractsTable)
      .where(eq(extractsTable.dumpId, dump.id));

    const dumpLogs = await this.db
      .select()
      .from(logsTable)
      .where(eq(logsTable.dumpId, dump.id))
      .orderBy(logsTable.createdAt);

    const display = dump.polishedText?.trim() || dump.dumpText;

    return {
      dump: {
        id: dump.id,
        text: display,
        status: dump.status,
        /** Never expose pipeline/LLM errors to the app (see `last_error` column server-side). */
        last_error: null,
        raw_text: dump.dumpText,
        polished_text: dump.polishedText,
        additional_context: dump.additionalContext ?? null,
        agent_assumptions: dump.agentAssumptions ?? null,
        has_audio: !!dump.audioKey,
        created_at: dump.createdAt.toISOString(),
      },
      extracts: items.map((a) => this.extracts.serialize(a)),
      logs: dumpLogs.map((l) => ({
        id: l.id,
        type: l.type,
        is_agent: l.isAgent,
        pem_note: l.pemNote,
        payload: l.payload,
        error: l.error
          ? { message: 'Something went wrong during this step.' }
          : null,
        created_at: l.createdAt.toISOString(),
      })),
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
    return Number.isNaN(d.getTime()) ? null : { createdAt: d, id: j.i };
  } catch {
    return null;
  }
}
