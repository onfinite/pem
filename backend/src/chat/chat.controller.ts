import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { MessageImageAsset, UserRow } from '../database/schemas';
import { BriefCronService } from '../background/queues/brief/brief-cron.service';
import { ChatImageDedupService } from './chat-image-dedup.service';
import { ChatService } from './chat.service';
import { ChatStreamService, type SseEvent } from './chat-stream.service';
import { SummarizeTranscriptService } from './summarize-transcript.service';
import { TranscriptionService } from '../transcription/transcription.service';
import { StorageService } from '../storage/storage.service';
import { CHAT_JOB_DELAY_MS_DUMP, CHAT_JOB_ID_PREFIX } from './chat.constants';
import { randomUUID } from 'node:crypto';

import { SendMessageDto } from './dto/send-message.dto';
import {
  MAX_PHOTO_UPLOAD_BYTES,
  PhotoUploadUrlDto,
} from './dto/photo-upload-url.dto';
import type { MessageRow } from '../database/schemas';

@ApiTags('chat')
@Controller('chat')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly chatImageDedup: ChatImageDedupService,
    private readonly stream: ChatStreamService,
    private readonly summarize: SummarizeTranscriptService,
    private readonly transcription: TranscriptionService,
    private readonly storage: StorageService,
    private readonly briefCron: BriefCronService,
    @InjectQueue('chat') private readonly chatQueue: Queue,
  ) {}

  @Post('photos/upload-url')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Presigned PUT URL for chat image (R2 direct upload)',
  })
  async photoUploadUrl(
    @CurrentUser() user: UserRow,
    @Body() body: PhotoUploadUrlDto,
  ) {
    if (!this.storage.enabled) {
      throw new BadRequestException('Image uploads are not configured');
    }
    if (body.byte_size != null && body.byte_size > MAX_PHOTO_UPLOAD_BYTES) {
      throw new BadRequestException('File too large');
    }
    if (body.content_sha256?.trim()) {
      const existing = await this.chatImageDedup.findExistingByHash(
        user.id,
        body.content_sha256,
      );
      if (existing) {
        return {
          is_duplicate: true,
          image_key: existing.imageKey,
          first_shared_at: existing.firstSharedAt.toISOString(),
          upload_url: null,
          expires_in_seconds: 0,
        };
      }
    }
    const ext = photoKeyExtension(body.content_type);
    const key = `chat-images/${user.id}/${randomUUID()}.${ext}`;
    const uploadUrl = await this.storage.getPresignedPutUrl(
      key,
      body.content_type,
    );
    if (!uploadUrl) {
      throw new BadRequestException('Could not create upload URL');
    }
    return {
      is_duplicate: false,
      upload_url: uploadUrl,
      image_key: key,
      expires_in_seconds: 900,
    };
  }

  @Post('messages')
  @HttpCode(200)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a message (text, voice, or image)' })
  async sendMessage(
    @CurrentUser() user: UserRow,
    @Body() body: SendMessageDto,
  ) {
    if (body.idempotency_key?.trim()) {
      const existing = await this.chat.findMessageByIdempotencyKey(
        user.id,
        body.idempotency_key,
      );
      if (existing) {
        const serialized = this.chat.serializeMessage(existing);
        await this.attachSignedMediaUrls(serialized, existing);
        return {
          message: serialized,
          status: 'received' as const,
          deduplicated: true as const,
        };
      }
    }

    if (body.kind === 'image') {
      const keysFromArray =
        body.image_keys && body.image_keys.length > 0
          ? body.image_keys.map((k) => ({
              key: k.key,
              mime: k.mime ?? null,
              content_sha256: k.content_sha256 ?? null,
            }))
          : null;
      const keysRaw =
        keysFromArray ??
        (body.image_key
          ? [{ key: body.image_key, mime: null as string | null }]
          : null);
      const keys = await this.chatImageDedup.prepareImageKeysForPersistence(
        user.id,
        keysRaw ?? [],
      );
      const msg = await this.chat.saveMessage({
        userId: user.id,
        role: 'user',
        kind: 'image',
        content: body.content?.trim() ? body.content : null,
        imageKeys: keys,
        triageCategory: null,
        processingStatus: 'pending',
        idempotencyKey: body.idempotency_key?.trim() || null,
      });
      await this.chatImageDedup.registerHashes(user.id, keys);
      await this.chatQueue.add(
        'process-message',
        { messageId: msg.id, userId: user.id },
        {
          jobId: `${CHAT_JOB_ID_PREFIX}${msg.id}`,
          delay: CHAT_JOB_DELAY_MS_DUMP,
          attempts: 3,
          backoff: { type: 'exponential', delay: 2000 },
        },
      );
      const serialized = this.chat.serializeMessage(msg);
      await this.attachSignedMediaUrls(serialized, msg);
      return {
        message: serialized,
        status: 'received' as const,
        deduplicated: false as const,
      };
    }

    const msg = await this.chat.saveMessage({
      userId: user.id,
      role: 'user',
      kind: body.kind,
      content: body.kind === 'text' ? body.content : null,
      voiceUrl: body.kind === 'voice' ? body.voice_url : null,
      audioKey: body.kind === 'voice' ? body.audio_key : null,
      triageCategory: null,
      processingStatus: 'pending',
      idempotencyKey: body.idempotency_key?.trim() || null,
    });

    await this.chatQueue.add(
      'process-message',
      {
        messageId: msg.id,
        userId: user.id,
      },
      {
        jobId: `${CHAT_JOB_ID_PREFIX}${msg.id}`,
        delay: CHAT_JOB_DELAY_MS_DUMP,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    const serialized = this.chat.serializeMessage(msg);
    await this.attachSignedMediaUrls(serialized, msg);
    return {
      message: serialized,
      status: 'received' as const,
      deduplicated: false as const,
    };
  }

  @Post('voice')
  @HttpCode(200)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  @ApiOperation({
    summary: 'Send a voice message (audio upload + transcription)',
  })
  async sendVoice(
    @CurrentUser() user: UserRow,
    @UploadedFile() audio: Express.Multer.File,
    @Body('image_keys') imageKeysJson?: string,
    @Query('idempotency_key') idempotencyKey?: string,
  ) {
    if (!audio?.buffer) {
      throw new BadRequestException('No audio file provided');
    }
    if (idempotencyKey?.trim()) {
      const existing = await this.chat.findMessageByIdempotencyKey(
        user.id,
        idempotencyKey,
      );
      if (existing) {
        const serialized = this.chat.serializeMessage(existing);
        await this.attachSignedMediaUrls(serialized, existing);
        return {
          message: serialized,
          status: 'received' as const,
          deduplicated: true as const,
        };
      }
    }

    let imageKeys: MessageImageAsset[] | null = null;
    if (imageKeysJson?.trim()) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(imageKeysJson) as unknown;
      } catch {
        throw new BadRequestException('image_keys must be valid JSON');
      }
      if (!Array.isArray(parsed)) {
        throw new BadRequestException('image_keys must be a JSON array');
      }
      const raw = parsed.map(
        (
          item,
        ): {
          key: string;
          mime?: string | null;
          content_sha256?: string | null;
        } => {
          if (!item || typeof item !== 'object' || Array.isArray(item)) {
            throw new BadRequestException('Invalid image_keys entry');
          }
          const o = item as Record<string, unknown>;
          const key = typeof o.key === 'string' ? o.key : '';
          if (!key) {
            throw new BadRequestException('Each image_keys item needs a key');
          }
          const mime = typeof o.mime === 'string' ? o.mime : null;
          const content_sha256 =
            typeof o.content_sha256 === 'string' ? o.content_sha256 : null;
          return { key, mime, content_sha256 };
        },
      );
      imageKeys = await this.chatImageDedup.prepareImageKeysForPersistence(
        user.id,
        raw,
      );
    }

    const transcript = await this.transcription.transcribe(audio);

    let audioKey: string | null = null;
    let voiceUrl: string | null = null;
    if (this.storage.enabled && audio.buffer) {
      audioKey = `chat-voice/${user.id}/${Date.now()}.m4a`;
      await this.storage.upload(
        audioKey,
        audio.buffer,
        audio.mimetype || 'audio/m4a',
      );
      voiceUrl = audioKey;
    }

    const msg = await this.chat.saveMessage({
      userId: user.id,
      role: 'user',
      kind: 'voice',
      content: transcript,
      transcript,
      voiceUrl,
      audioKey,
      imageKeys,
      processingStatus: 'pending',
      idempotencyKey: idempotencyKey?.trim() || null,
    });
    if (imageKeys?.length) {
      await this.chatImageDedup.registerHashes(user.id, imageKeys);
    }

    await this.chatQueue.add(
      'process-message',
      { messageId: msg.id, userId: user.id },
      {
        jobId: `${CHAT_JOB_ID_PREFIX}${msg.id}`,
        delay: CHAT_JOB_DELAY_MS_DUMP,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    const serialized = this.chat.serializeMessage(msg);
    await this.attachSignedMediaUrls(serialized, msg);
    return {
      message: serialized,
      status: 'received' as const,
      deduplicated: false as const,
    };
  }

  @Get('messages')
  @SkipThrottle()
  @ApiOperation({ summary: 'Paginated chat history' })
  async getMessages(
    @CurrentUser() user: UserRow,
    @Query('before') before?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50;
    const { messages, has_more } = await this.chat.getMessages(user.id, {
      before,
      limit: Number.isNaN(limit) ? 50 : limit,
    });
    const serialized = await Promise.all(
      messages.map(async (m) => {
        const s = this.chat.serializeMessage(m);
        await this.attachSignedMediaUrls(s, m);
        return s;
      }),
    );
    return { messages: serialized, has_more };
  }

  @Get('stream')
  @Sse()
  @Header('X-Accel-Buffering', 'no')
  @SkipThrottle()
  @ApiOperation({ summary: 'SSE stream — one persistent connection per user' })
  sseStream(@CurrentUser() user: UserRow): Observable<SseEvent> {
    return this.stream.createStream(user.id);
  }

  @Post('brief')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ensure today brief exists — generates if missing' })
  async ensureBrief(@CurrentUser() user: UserRow) {
    const result = await this.briefCron.ensureBriefForToday(user);
    return result;
  }

  @Post('messages/:id/summarize')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Generate a summary of a voice message transcript' })
  async summarizeMessage(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const summary = await this.summarize.summarize(user.id, id);
    return { summary };
  }

  @Delete('messages/:id')
  @HttpCode(200)
  @ApiOperation({ summary: 'Delete a chat message' })
  async deleteMessage(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.chat.deleteMessage(user.id, id);
    return { ok: true };
  }

  @Get('messages/:id/extracts')
  @ApiOperation({ summary: 'Get extracts linked to a specific message' })
  async getMessageExtracts(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const extracts = await this.chat.getMessageExtracts(user.id, id);
    return { extracts };
  }

  @Get('messages/search')
  @ApiOperation({ summary: 'Search chat messages' })
  async searchMessages(
    @CurrentUser() user: UserRow,
    @Query('q') query: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 20;
    const messages = await this.chat.searchMessages(
      user.id,
      query || '',
      Number.isNaN(limit) ? 20 : limit,
    );
    return {
      messages: await Promise.all(
        messages.map(async (m) => {
          const s = this.chat.serializeMessage(m);
          await this.attachSignedMediaUrls(s, m);
          return s;
        }),
      ),
    };
  }

  /** Voice GET URL + image preview URLs for client display. */
  private async attachSignedMediaUrls(
    serialized: ReturnType<ChatService['serializeMessage']>,
    row: MessageRow,
  ): Promise<void> {
    if (row.audioKey && this.storage.enabled) {
      serialized.voice_url =
        (await this.storage.getSignedUrl(row.audioKey)) ?? serialized.voice_url;
    }
    const keys = row.imageKeys;
    if (keys?.length && this.storage.enabled) {
      const pairs: { key: string; url: string }[] = [];
      for (const a of keys) {
        const url = await this.storage.getSignedUrl(a.key);
        if (url) pairs.push({ key: a.key, url });
      }
      if (pairs.length) serialized.image_urls = pairs;
    }
    await this.refreshPhotoRecallSignedUrls(serialized);
  }

  /** DB stores short-lived presigned URLs; re-sign keys on each read for the client. */
  private async refreshPhotoRecallSignedUrls(
    serialized: ReturnType<ChatService['serializeMessage']>,
  ): Promise<void> {
    if (!this.storage.enabled) return;
    const meta = serialized.metadata;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;

    const metaObj: Record<string, unknown> = { ...meta };
    const recall = metaObj.photo_recall;
    if (!Array.isArray(recall) || recall.length === 0) return;

    const next: Record<string, unknown>[] = await Promise.all(
      recall.map(async (entry): Promise<Record<string, unknown>> => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return {};
        }
        const o: Record<string, unknown> = {
          ...(entry as Record<string, unknown>),
        };
        const imageKey = typeof o.image_key === 'string' ? o.image_key : '';
        if (!imageKey) {
          return o;
        }
        const url = await this.storage.getSignedUrl(imageKey);
        return { ...o, signed_url: url ?? o.signed_url };
      }),
    );

    serialized.metadata = { ...metaObj, photo_recall: next };
  }
}

function photoKeyExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}
