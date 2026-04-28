import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { DatabaseModule } from '@/database/database.module';
import { StorageModule } from '@/storage/storage.module';
import { TranscriptionModule } from '@/transcription/transcription.module';
import { UsersModule } from '@/users/users.module';
import { ChatImageDedupService } from '@/chat/chat-image-dedup.service';
import { ChatController } from '@/chat/chat.controller';
import { ChatService } from '@/chat/chat.service';
import { ChatStreamService } from '@/chat/chat-stream.service';
import { SummarizeTranscriptService } from '@/chat/summarize-transcript.service';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    TranscriptionModule,
    UsersModule,
    BullModule.registerQueue({ name: 'chat' }),
  ],
  controllers: [ChatController],
  providers: [
    ChatService,
    ChatImageDedupService,
    ChatStreamService,
    SummarizeTranscriptService,
  ],
  exports: [ChatService],
})
export class ChatModule {}
