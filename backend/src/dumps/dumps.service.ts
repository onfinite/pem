import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, lt, or, sql } from 'drizzle-orm';
import type { Queue } from 'bullmq';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { ExtractsService } from '../extracts/extracts.service';
import { extractsTable, dumpsTable, type UserRow } from '../database/schemas';

export const DUMP_TEXT_MAX_CHARS = 16_000;

@Injectable()
export class DumpsService {
  private readonly log = new Logger(DumpsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    @InjectQueue('dump') private readonly dumpQueue: Queue,
    private readonly extracts: ExtractsService,
    private readonly config: ConfigService,
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
        removeOnComplete: true,
      },
    );

    this.log.log(`dump ${dump.id} queued for extraction for user ${user.id}`);
    return { dumpId: dump.id };
  }

  async createFromVoice(
    user: UserRow,
    audio: Express.Multer.File,
  ): Promise<{ dumpId: string; text: string }> {
    if (!audio?.buffer) {
      throw new BadRequestException('No audio file provided');
    }

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      throw new BadRequestException('Transcription service unavailable');
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audio.buffer)], {
      type: audio.mimetype || 'audio/m4a',
    });
    formData.append('file', blob, audio.originalname || 'recording.m4a');
    formData.append('model', 'whisper-1');
    formData.append('language', 'en');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      this.log.error(`Whisper API error: ${res.status} ${errBody}`);
      throw new BadRequestException('Transcription failed');
    }

    const json = (await res.json()) as { text: string };
    const text = json.text?.trim();
    if (!text) {
      throw new BadRequestException('Could not transcribe audio');
    }

    const result = await this.createDump(user, text);
    return { dumpId: result.dumpId, text };
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
        lastError: dumpsTable.lastError,
        createdAt: dumpsTable.createdAt,
      })
      .from(dumpsTable)
      .where(where)
      .orderBy(desc(dumpsTable.createdAt), desc(dumpsTable.id))
      .limit(lim + 1);

    const hasMore = rows.length > lim;
    const page = hasMore ? rows.slice(0, lim) : rows;
    const last = page[page.length - 1];

    const dumps: {
      id: string;
      text: string;
      status: string;
      last_error: string | null;
      created_at: string;
      extract_count: number;
    }[] = [];

    for (const r of page) {
      const [cnt] = await this.db
        .select({ c: sql<number>`count(*)::int` })
        .from(extractsTable)
        .where(eq(extractsTable.dumpId, r.id));
      const display = r.polishedText?.trim() || r.dumpText;
      dumps.push({
        id: r.id,
        text: display,
        status: r.status,
        last_error: r.lastError ?? null,
        created_at: r.createdAt.toISOString(),
        extract_count: cnt?.c ?? 0,
      });
    }

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

    const display = dump.polishedText?.trim() || dump.dumpText;

    return {
      dump: {
        id: dump.id,
        text: display,
        status: dump.status,
        last_error: dump.lastError ?? null,
        raw_text: dump.dumpText,
        polished_text: dump.polishedText,
        additional_context: dump.additionalContext ?? null,
        agent_assumptions: dump.agentAssumptions ?? null,
        created_at: dump.createdAt.toISOString(),
      },
      extracts: items.map((a) => this.extracts.serialize(a)),
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
