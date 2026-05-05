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
import { BriefCronService } from '@/modules/briefs/brief-cron.service';
import { ChatImageDedupService } from '@/modules/media/photo/chat-image-dedup.service';
import { ChatMessageSignedMediaService } from '@/modules/media/chat-message-signed-media.service';
import { ChatEventsService } from '@/modules/messaging/chat-events.service';
import { ChatMessagesForClientService } from '@/modules/messaging/chat-messages-for-client.service';
import { ChatService } from '@/modules/messages/chat.service';
import {
  ChatStreamService,
  type SseEvent,
} from '@/modules/messaging/chat-stream.service';
import { ChatVoiceUploadService } from '@/modules/media/voice/chat-voice-upload.service';
import { SummarizeTranscriptService } from '@/modules/media/voice/summarize-transcript.service';
import { StorageService } from '@/modules/storage/storage.service';
import { randomUUID } from 'node:crypto';
import {
  buildChatProcessMessageJobOpts,
  photoKeyExtension,
  rawImageInputsFromSendPayload,
} from '@/modules/chat/helpers/chat-inbound.helpers';

import { SendMessageDto } from '@/modules/chat/dto/send-message.dto';
import {
  MAX_PHOTO_UPLOAD_BYTES,
  PhotoUploadUrlDto,
} from '@/modules/chat/dto/photo-upload-url.dto';

@Controller('chat')
@UseGuards(ClerkAuthGuard)
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly chatEvents: ChatEventsService,
    private readonly chatImageDedup: ChatImageDedupService,
    private readonly stream: ChatStreamService,
    private readonly summarize: SummarizeTranscriptService,
    private readonly storage: StorageService,
    private readonly briefCron: BriefCronService,
    private readonly signedMedia: ChatMessageSignedMediaService,
    private readonly voiceUpload: ChatVoiceUploadService,
    private readonly messagesForClient: ChatMessagesForClientService,
    @InjectQueue('chat') private readonly chatQueue: Queue,
  ) {}

  /** So other devices / tabs with an open SSE stream stay in sync with new user rows. */
  private async publishUserMessageSse(
    userId: string,
    message: ReturnType<ChatService['serializeMessage']>,
  ): Promise<void> {
    await this.chatEvents.publish(userId, 'user_message', { message });
  }

  @Post('messages')
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
      const voiceResult = await this.voiceUpload.acceptRecordedAudio(
        user,
        audio,
        body,
        idempotencyKeyQuery,
      );
      await this.publishUserMessageSse(user.id, voiceResult.message);
      return voiceResult;
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
        await this.signedMedia.hydrateForClient(serialized, existing);
        await this.publishUserMessageSse(user.id, serialized);
        return {
          message: serialized,
          status: 'received' as const,
          deduplicated: true as const,
        };
      }
    }

    if (dto.kind === 'image') {
      const raw = rawImageInputsFromSendPayload({
        image_keys: dto.image_keys,
        image_key: dto.image_key,
      });
      const keys = await this.chatImageDedup.prepareImageKeysForPersistence(
        user.id,
        raw,
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
        buildChatProcessMessageJobOpts(msg.id),
      );
      const serialized = this.chat.serializeMessage(msg);
      await this.signedMedia.hydrateForClient(serialized, msg);
      await this.publishUserMessageSse(user.id, serialized);
      return {
        message: serialized,
        status: 'received' as const,
        deduplicated: false as const,
      };
    }

    const rawVoiceImages = rawImageInputsFromSendPayload({
      image_keys: dto.image_keys,
      image_key: dto.image_key,
    });
    let voiceImageKeys: MessageImageAsset[] | null = null;
    if (dto.kind === 'voice' && rawVoiceImages.length > 0) {
      voiceImageKeys = await this.chatImageDedup.prepareImageKeysForPersistence(
        user.id,
        rawVoiceImages,
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
      buildChatProcessMessageJobOpts(msg.id),
    );

    const serialized = this.chat.serializeMessage(msg);
    await this.signedMedia.hydrateForClient(serialized, msg);
    await this.publishUserMessageSse(user.id, serialized);
    return {
      message: serialized,
      status: 'received' as const,
      deduplicated: false as const,
    };
  }

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
    const serialized =
      await this.messagesForClient.serializeListWithMediaAndLinks(
        user.id,
        messages,
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
    return {
      messages: await this.messagesForClient.serializeListWithMediaAndLinks(
        user.id,
        messages,
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
    return {
      message: await this.messagesForClient.serializeOneWithMediaAndLinks(
        user.id,
        row,
      ),
    };
  }
}
