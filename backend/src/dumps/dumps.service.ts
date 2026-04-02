import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type { Queue } from 'bullmq';
import OpenAI, { toFile } from 'openai';

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
    private readonly config: ConfigService,
    @InjectQueue('dump') private readonly dumpQueue: Queue,
  ) {}

  async createDump(
    user: UserRow,
    transcript: string,
    audioUrl?: string | null,
  ): Promise<{ status: string; dumpId: string; prepIds: string[] }> {
    const [dump] = await this.db
      .insert(dumpsTable)
      .values({
        userId: user.id,
        transcript: transcript.trim(),
        audioUrl: audioUrl ?? null,
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

  async createDumpFromAudio(
    user: UserRow,
    file: Express.Multer.File,
  ): Promise<{ dumpId: string; prepIds: string[] }> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      throw new ServiceUnavailableException('OPENAI_API_KEY not configured');
    }
    if (!file.buffer?.length) {
      throw new BadRequestException('Empty audio upload');
    }

    const name = file.originalname || 'dump.m4a';
    const mime = file.mimetype || 'audio/m4a';
    const openai = new OpenAI({ apiKey });
    const uploadable = await toFile(file.buffer, name, { type: mime });
    let transcript: string;
    try {
      transcript = await openai.audio.transcriptions.create({
        file: uploadable,
        model: 'whisper-1',
        response_format: 'text',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`whisper failed: ${msg}`);
      throw new BadRequestException('Could not transcribe audio');
    }

    const trimmed = transcript.trim().slice(0, DUMP_TRANSCRIPT_MAX_CHARS);
    if (!trimmed) {
      throw new BadRequestException('Transcription was empty');
    }

    return this.createDump(user, trimmed, null);
  }

  async listDumpsForUser(userId: string) {
    return this.db
      .select()
      .from(dumpsTable)
      .where(eq(dumpsTable.userId, userId));
  }
}
