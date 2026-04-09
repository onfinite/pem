import {
  Body,
  Controller,
  Get,
  HttpCode,
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
import { SkipThrottle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Observable } from 'rxjs';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { ChatService } from './chat.service';
import { ChatStreamService, type SseEvent } from './chat-stream.service';
import { TranscriptionService } from '../transcription/transcription.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('chat')
@Controller('chat')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly stream: ChatStreamService,
    private readonly transcription: TranscriptionService,
    private readonly storage: StorageService,
    @InjectQueue('chat') private readonly chatQueue: Queue,
  ) {}

  @Post('messages')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a message (text or voice)' })
  async sendMessage(
    @CurrentUser() user: UserRow,
    @Body()
    body: {
      kind: 'text' | 'voice';
      content?: string;
      voice_url?: string;
      audio_key?: string;
    },
  ) {
    const msg = await this.chat.saveMessage({
      userId: user.id,
      role: 'user',
      kind: body.kind,
      content: body.kind === 'text' ? body.content : null,
      voiceUrl: body.kind === 'voice' ? body.voice_url : null,
      audioKey: body.kind === 'voice' ? body.audio_key : null,
      processingStatus: 'pending',
    });

    await this.chatQueue.add(
      'process-message',
      {
        messageId: msg.id,
        userId: user.id,
      },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    return {
      message: this.chat.serializeMessage(msg),
      status: 'received',
    };
  }

  @Post('voice')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('audio'))
  @ApiOperation({
    summary: 'Send a voice message (audio upload + transcription)',
  })
  async sendVoice(
    @CurrentUser() user: UserRow,
    @UploadedFile() audio: Express.Multer.File,
  ) {
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
      processingStatus: 'pending',
    });

    await this.chatQueue.add(
      'process-message',
      { messageId: msg.id, userId: user.id },
      { attempts: 3, backoff: { type: 'exponential', delay: 2000 } },
    );

    const serialized = this.chat.serializeMessage(msg);
    if (audioKey && this.storage.enabled) {
      serialized.voice_url =
        (await this.storage.getSignedUrl(audioKey)) ?? serialized.voice_url;
    }
    return { message: serialized, status: 'received' };
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
        if (m.audioKey && this.storage.enabled) {
          s.voice_url =
            (await this.storage.getSignedUrl(m.audioKey)) ?? s.voice_url;
        }
        return s;
      }),
    );
    return { messages: serialized, has_more };
  }

  @Get('stream')
  @Sse()
  @SkipThrottle()
  @ApiOperation({ summary: 'SSE stream — one persistent connection per user' })
  sseStream(@CurrentUser() user: UserRow): Observable<SseEvent> {
    return this.stream.createStream(user.id);
  }
}
