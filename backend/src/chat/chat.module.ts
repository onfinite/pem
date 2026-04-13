import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { AgentsModule } from '../agents/agents.module';
import { DatabaseModule } from '../database/database.module';
import { StorageModule } from '../storage/storage.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { UsersModule } from '../users/users.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatStreamService } from './chat-stream.service';
import { SummarizeTranscriptService } from './summarize-transcript.service';

@Module({
  imports: [
    AgentsModule,
    DatabaseModule,
    StorageModule,
    TranscriptionModule,
    UsersModule,
    BullModule.registerQueue({ name: 'chat' }),
  ],
  controllers: [ChatController],
  providers: [ChatService, ChatStreamService, SummarizeTranscriptService],
  exports: [ChatService],
})
export class ChatModule {}
