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

import { ClassifyAgent } from '../agents/classify.agent';
import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { dumpsTable, prepsTable, type UserRow } from '../database/schemas';

@Injectable()
export class DumpsService {
  private readonly log = new Logger(DumpsService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly classify: ClassifyAgent,
    @InjectQueue('prep') private readonly prepQueue: Queue,
  ) {}

  async createDump(
    user: UserRow,
    transcript: string,
    audioUrl?: string | null,
  ): Promise<{ dumpId: string; prepIds: string[] }> {
    const [dump] = await this.db
      .insert(dumpsTable)
      .values({
        userId: user.id,
        transcript: transcript.trim(),
        audioUrl: audioUrl ?? null,
      })
      .returning();

    const thoughts = await this.classify.classifyTranscript(dump.transcript);
    const prepIds: string[] = [];

    for (const t of thoughts) {
      const [prep] = await this.db
        .insert(prepsTable)
        .values({
          userId: user.id,
          dumpId: dump.id,
          title: t.title,
          prepType: t.prepType,
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
      prepIds.push(prep.id);
    }

    this.log.log(
      `dump ${dump.id} created with ${prepIds.length} prep job(s) for user ${user.id}`,
    );
    return { dumpId: dump.id, prepIds };
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

    const trimmed = transcript.trim();
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
