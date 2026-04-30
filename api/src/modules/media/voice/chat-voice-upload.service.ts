import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';

import type { MessageImageAsset, UserRow } from '@/database/schemas/index';
import { ChatImageDedupService } from '@/modules/media/photo/chat-image-dedup.service';
import { ChatMessageSignedMediaService } from '@/modules/media/chat-message-signed-media.service';
import { ChatService } from '@/modules/messages/chat.service';
import {
  buildChatProcessMessageJobOpts,
  parseMultipartImageKeysJson,
} from '@/modules/chat/helpers/chat-inbound.helpers';
import { StorageService } from '@/modules/storage/storage.service';
import { TranscriptionService } from '@/modules/media/voice/transcription.service';

export type VoiceUploadResult = {
  message: ReturnType<ChatService['serializeMessage']>;
  status: 'received';
  deduplicated: boolean;
};

@Injectable()
export class ChatVoiceUploadService {
  constructor(
    private readonly chat: ChatService,
    private readonly chatImageDedup: ChatImageDedupService,
    private readonly transcription: TranscriptionService,
    private readonly storage: StorageService,
    private readonly signedMedia: ChatMessageSignedMediaService,
    @InjectQueue('chat') private readonly chatQueue: Queue,
  ) {}

  async acceptRecordedAudio(
    user: UserRow,
    audio: Express.Multer.File,
    body: Record<string, unknown>,
    idempotencyKeyQuery?: string,
  ): Promise<VoiceUploadResult> {
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
        await this.signedMedia.hydrateForClient(serialized, existing);
        return {
          message: serialized,
          status: 'received',
          deduplicated: true,
        };
      }
    }

    let imageKeys: MessageImageAsset[] | null = null;
    if (imageKeysJson?.trim()) {
      const raw = parseMultipartImageKeysJson(imageKeysJson);
      imageKeys = await this.chatImageDedup.prepareImageKeysForPersistence(
        user.id,
        raw,
      );
    }

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

    /** With R2, Whisper runs in the BullMQ worker after enqueue. Without R2, transcribe here (no object for the worker to fetch). */
    let transcript: string | null = null;
    let content: string | null = null;
    if (!this.storage.enabled) {
      const text = await this.transcription.transcribe(audio);
      transcript = text;
      content = text;
    }

    const msg = await this.chat.saveMessage({
      userId: user.id,
      role: 'user',
      kind: 'voice',
      content,
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
      buildChatProcessMessageJobOpts(msg.id),
    );

    const serialized = this.chat.serializeMessage(msg);
    await this.signedMedia.hydrateForClient(serialized, msg);
    return {
      message: serialized,
      status: 'received',
      deduplicated: false,
    };
  }
}
