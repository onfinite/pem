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
import type { UserRow } from '../database/schemas';
import { TriageService, type TriageCategory } from '../agents/triage.service';
import { BriefCronService } from '../background/queues/brief/brief-cron.service';
import { ChatService } from './chat.service';
import { ChatStreamService, type SseEvent } from './chat-stream.service';
import { SummarizeTranscriptService } from './summarize-transcript.service';
import { TranscriptionService } from '../transcription/transcription.service';
import { StorageService } from '../storage/storage.service';
import {
  CHAT_JOB_DELAY_MS_DUMP,
  CHAT_JOB_DELAY_MS_QUESTION,
  CHAT_JOB_ID_PREFIX,
} from './chat.constants';
import { SendMessageDto } from './dto/send-message.dto';

@ApiTags('chat')
@Controller('chat')
@UseGuards(ClerkAuthGuard)
@ApiBearerAuth('clerk')
export class ChatController {
  constructor(
    private readonly chat: ChatService,
    private readonly stream: ChatStreamService,
    private readonly summarize: SummarizeTranscriptService,
    private readonly transcription: TranscriptionService,
    private readonly storage: StorageService,
    private readonly briefCron: BriefCronService,
    private readonly triage: TriageService,
    @InjectQueue('chat') private readonly chatQueue: Queue,
  ) {}

  @Post('messages')
  @HttpCode(200)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @ApiOperation({ summary: 'Send a message (text or voice)' })
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
        return {
          message: this.chat.serializeMessage(existing),
          status: 'received' as const,
          deduplicated: true as const,
        };
      }
    }

    const textContent =
      body.kind === 'text' ? body.content?.trim() ?? '' : '';

    let triageCategory: TriageCategory | null = null;
    if (textContent) {
      triageCategory = await this.triage.classify(textContent);
    }

    const msg = await this.chat.saveMessage({
      userId: user.id,
      role: 'user',
      kind: body.kind,
      content: body.kind === 'text' ? body.content : null,
      voiceUrl: body.kind === 'voice' ? body.voice_url : null,
      audioKey: body.kind === 'voice' ? body.audio_key : null,
      triageCategory,
      processingStatus: 'pending',
      idempotencyKey: body.idempotency_key?.trim() || null,
    });

    const isInstant =
      triageCategory === 'question_only' || triageCategory === 'trivial';
    const delay = isInstant
      ? CHAT_JOB_DELAY_MS_QUESTION
      : CHAT_JOB_DELAY_MS_DUMP;

    await this.chatQueue.add(
      'process-message',
      {
        messageId: msg.id,
        userId: user.id,
      },
      {
        jobId: `${CHAT_JOB_ID_PREFIX}${msg.id}`,
        delay,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    return {
      message: this.chat.serializeMessage(msg),
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
        if (existing.audioKey && this.storage.enabled) {
          serialized.voice_url =
            (await this.storage.getSignedUrl(existing.audioKey)) ??
            serialized.voice_url;
        }
        return {
          message: serialized,
          status: 'received' as const,
          deduplicated: true as const,
        };
      }
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
      processingStatus: 'pending',
      idempotencyKey: idempotencyKey?.trim() || null,
    });

    let triageCat: TriageCategory | null = null;
    if (transcript) {
      triageCat = await this.triage.classify(transcript);
    }
    if (triageCat) {
      await this.chat.updateMessage(msg.id, { triageCategory: triageCat }, user.id);
    }

    const isInstantVoice =
      triageCat === 'question_only' || triageCat === 'trivial';

    await this.chatQueue.add(
      'process-message',
      { messageId: msg.id, userId: user.id },
      {
        jobId: `${CHAT_JOB_ID_PREFIX}${msg.id}`,
        delay: isInstantVoice ? CHAT_JOB_DELAY_MS_QUESTION : CHAT_JOB_DELAY_MS_DUMP,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    const serialized = this.chat.serializeMessage(msg);
    if (audioKey && this.storage.enabled) {
      serialized.voice_url =
        (await this.storage.getSignedUrl(audioKey)) ?? serialized.voice_url;
    }
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
    return { messages: messages.map((m) => this.chat.serializeMessage(m)) };
  }
}
