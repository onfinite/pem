import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  NotFoundException,
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
import { Observable } from 'rxjs';

import { ClerkAuthGuard } from '@/core/auth/clerk-auth.guard';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import type { MessageImageAsset, UserRow } from '@/database/schemas/index';
import { BriefCronService } from '@/modules/chat/services/brief-cron.service';
import { ChatImageDedupService } from '@/modules/chat/services/chat-image-dedup.service';
import { ChatService } from '@/modules/chat/services/chat.service';
import {
  ChatStreamService,
  type SseEvent,
} from '@/modules/chat/services/chat-stream.service';
import { SummarizeTranscriptService } from '@/modules/chat/services/summarize-transcript.service';
import { TranscriptionService } from '@/modules/transcription/transcription.service';
import { StorageService } from '@/modules/storage/storage.service';
import {
  CHAT_JOB_DELAY_MS_DUMP,
  CHAT_JOB_ID_PREFIX,
} from '@/modules/chat/constants/chat.constants';
import { randomUUID } from 'node:crypto';

import { SendMessageDto } from '@/modules/chat/dto/send-message.dto';
import {
  MAX_PHOTO_UPLOAD_BYTES,
  PhotoUploadUrlDto,
} from '@/modules/chat/dto/photo-upload-url.dto';
import type { MessageRow } from '@/database/schemas/index';

@Controller('chat')
@UseGuards(ClerkAuthGuard)
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
  @UseInterceptors(
    FileInterceptor('audio', { limits: { fileSize: 25 * 1024 * 1024 } }),
  )
  async sendMessage(
    @CurrentUser() user: UserRow,
    @Body() body: Record<string, unknown>,
    @UploadedFile() audio?: Express.Multer.File,
    @Query('idempotency_key') idempotencyKeyQuery?: string,
  ) {
    if (audio?.buffer) {
      return this.receiveVoiceWithUploadedAudio(
        user,
        audio,
        body,
        idempotencyKeyQuery,
      );
    }

    const dto = plainToInstance(SendMessageDto, body);
    const errors = await validate(dto, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    if (errors.length > 0) {
      const msg = errors
        .flatMap((e) => (e.constraints ? Object.values(e.constraints) : []))
        .join('; ');
      throw new BadRequestException(msg || 'Invalid message body');
    }

    if (dto.idempotency_key?.trim()) {
      const existing = await this.chat.findMessageByIdempotencyKey(
        user.id,
        dto.idempotency_key,
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

    if (dto.kind === 'image') {
      const keysFromArray =
        dto.image_keys && dto.image_keys.length > 0
          ? dto.image_keys.map((k) => ({
              key: k.key,
              mime: k.mime ?? null,
              content_sha256: k.content_sha256 ?? null,
            }))
          : null;
      const keysRaw =
        keysFromArray ??
        (dto.image_key
          ? [{ key: dto.image_key, mime: null as string | null }]
          : null);
      const keys = await this.chatImageDedup.prepareImageKeysForPersistence(
        user.id,
        keysRaw ?? [],
      );
      const msg = await this.chat.saveMessage({
        userId: user.id,
        role: 'user',
        kind: 'image',
        content: dto.content?.trim() ? dto.content : null,
        imageKeys: keys,
        triageCategory: null,
        processingStatus: 'pending',
        idempotencyKey: dto.idempotency_key?.trim() || null,
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

    let voiceImageKeys: MessageImageAsset[] | null = null;
    if (
      dto.kind === 'voice' &&
      (dto.image_keys?.length || dto.image_key?.trim())
    ) {
      const keysFromArray =
        dto.image_keys && dto.image_keys.length > 0
          ? dto.image_keys.map((k) => ({
              key: k.key,
              mime: k.mime ?? null,
              content_sha256: k.content_sha256 ?? null,
            }))
          : null;
      const keysRaw =
        keysFromArray ??
        (dto.image_key
          ? [{ key: dto.image_key, mime: null as string | null }]
          : null);
      voiceImageKeys = await this.chatImageDedup.prepareImageKeysForPersistence(
        user.id,
        keysRaw ?? [],
      );
    }

    const msg = await this.chat.saveMessage({
      userId: user.id,
      role: 'user',
      kind: dto.kind,
      content: dto.kind === 'text' ? dto.content : null,
      voiceUrl: dto.kind === 'voice' ? dto.voice_url : null,
      audioKey: dto.kind === 'voice' ? dto.audio_key : null,
      imageKeys: voiceImageKeys,
      triageCategory: null,
      processingStatus: 'pending',
      idempotencyKey: dto.idempotency_key?.trim() || null,
    });

    if (voiceImageKeys?.length) {
      await this.chatImageDedup.registerHashes(user.id, voiceImageKeys);
    }

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

  private async receiveVoiceWithUploadedAudio(
    user: UserRow,
    audio: Express.Multer.File,
    body: Record<string, unknown>,
    idempotencyKeyQuery?: string,
  ) {
    const idempotencyFromBody =
      typeof body.idempotency_key === 'string'
        ? body.idempotency_key.trim()
        : '';
    const idempotencyFromQuery = idempotencyKeyQuery?.trim() ?? '';
    const idempotencyKey = idempotencyFromBody || idempotencyFromQuery || '';
    const imageKeysJson =
      typeof body.image_keys === 'string' ? body.image_keys : undefined;

    if (idempotencyKey) {
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
      idempotencyKey: idempotencyKey || null,
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
    const linkMap = await this.chat.getLinkPreviewsByMessageIds(
      user.id,
      messages.map((m) => m.id),
    );
    const serialized = await Promise.all(
      messages.map(async (m) => {
        const s = this.chat.serializeMessage(m);
        await this.attachSignedMediaUrls(s, m);
        const lp = linkMap.get(m.id);
        if (lp?.length) s.link_previews = lp;
        return s;
      }),
    );
    return { messages: serialized, has_more };
  }

  @Get('stream')
  @Sse()
  @Header('X-Accel-Buffering', 'no')
  sseStream(@CurrentUser() user: UserRow): Observable<SseEvent> {
    return this.stream.createStream(user.id);
  }

  @Post('brief')
  @HttpCode(200)
  async ensureBrief(@CurrentUser() user: UserRow) {
    const result = await this.briefCron.ensureBriefForToday(user);
    return result;
  }

  @Post('messages/:id/summarize')
  @HttpCode(200)
  async summarizeMessage(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const summary = await this.summarize.summarize(user.id, id);
    return { summary };
  }

  @Delete('messages/:id')
  @HttpCode(200)
  async deleteMessage(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    await this.chat.deleteMessage(user.id, id);
    return { ok: true };
  }

  @Get('messages/:id/extracts')
  async getMessageExtracts(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const extracts = await this.chat.getMessageExtracts(user.id, id);
    return { extracts };
  }

  @Get('messages/search')
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
    const linkMap = await this.chat.getLinkPreviewsByMessageIds(
      user.id,
      messages.map((m) => m.id),
    );
    return {
      messages: await Promise.all(
        messages.map(async (m) => {
          const s = this.chat.serializeMessage(m);
          await this.attachSignedMediaUrls(s, m);
          const lp = linkMap.get(m.id);
          if (lp?.length) s.link_previews = lp;
          return s;
        }),
      ),
    };
  }

  @Get('messages/:id')
  async getMessage(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ) {
    const row = await this.chat.findMessage(id, user.id);
    if (!row) throw new NotFoundException();
    const serialized = this.chat.serializeMessage(row);
    await this.attachSignedMediaUrls(serialized, row);
    const linkMap = await this.chat.getLinkPreviewsByMessageIds(user.id, [
      row.id,
    ]);
    const lp = linkMap.get(row.id);
    if (lp?.length) serialized.link_previews = lp;
    return { message: serialized };
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
