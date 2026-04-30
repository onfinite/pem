import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '@/database/database.module';
import { MemoryModule } from '@/modules/memory/memory.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { ChatImageDedupService } from '@/modules/media/photo/chat-image-dedup.service';
import { ChatPhotoRecallIntentLlmService } from '@/modules/media/photo/chat-photo-recall-intent-llm.service';
import { ChatPhotoRecallIntentService } from '@/modules/media/photo/chat-photo-recall-intent.service';
import { ImageReferenceOnlyReplyService } from '@/modules/media/photo/image-reference-only-reply.service';
import { PhotoAttachmentIntentService } from '@/modules/media/photo/photo-attachment-intent.service';
import { PhotoVisionService } from '@/modules/media/photo/photo-vision.service';
import { ChatLinkPipelineService } from '@/modules/media/links/chat-link-pipeline.service';
import { OgHtmlReaderService } from '@/modules/media/links/og-html-reader.service';
import { ChatMessageSignedMediaService } from '@/modules/media/chat-message-signed-media.service';
import { ChatVoiceUploadService } from '@/modules/media/voice/chat-voice-upload.service';
import { SummarizeTranscriptService } from '@/modules/media/voice/summarize-transcript.service';
import { TranscriptionService } from '@/modules/media/voice/transcription.service';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    StorageModule,
    MessagesModule,
    MemoryModule,
    BullModule.registerQueue({ name: 'chat' }),
  ],
  providers: [
    TranscriptionService,
    SummarizeTranscriptService,
    ChatVoiceUploadService,
    ChatImageDedupService,
    ChatMessageSignedMediaService,
    PhotoVisionService,
    ChatPhotoRecallIntentLlmService,
    ChatPhotoRecallIntentService,
    PhotoAttachmentIntentService,
    ImageReferenceOnlyReplyService,
    OgHtmlReaderService,
    ChatLinkPipelineService,
  ],
  exports: [
    TranscriptionService,
    SummarizeTranscriptService,
    ChatVoiceUploadService,
    ChatImageDedupService,
    ChatMessageSignedMediaService,
    PhotoVisionService,
    ChatPhotoRecallIntentService,
    PhotoAttachmentIntentService,
    ImageReferenceOnlyReplyService,
    OgHtmlReaderService,
    ChatLinkPipelineService,
  ],
})
export class MediaModule {}
