import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { CalendarModule } from '@/modules/calendar/calendar.module';
import { DatabaseModule } from '@/database/database.module';
import { EmbeddingsModule } from '@/modules/embeddings/embeddings.module';
import { ExtractsModule } from '@/modules/extracts/extracts.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { PushModule } from '@/modules/push/push.module';
import { SchedulerModule } from '@/modules/scheduler/scheduler.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { TranscriptionModule } from '@/modules/transcription/transcription.module';
import { UsersModule } from '@/modules/users/users.module';
import { BriefCronService } from '@/modules/chat/services/brief-cron.service';
import { ChatEventsService } from '@/modules/chat/services/chat-events.service';
import { ChatImageDedupService } from '@/modules/chat/services/chat-image-dedup.service';
import { ChatController } from '@/modules/chat/chat.controller';
import { ChatService } from '@/modules/chat/services/chat.service';
import { ChatStreamService } from '@/modules/chat/services/chat-stream.service';
import { SummarizeTranscriptService } from '@/modules/chat/services/summarize-transcript.service';
import { WeeklyPlanningCronService } from '@/modules/chat/services/weekly-planning-cron.service';
import { ChatLinkPipelineService } from '@/modules/chat/jobs/chat-link-pipeline.service';
import { ChatOrchestratorService } from '@/modules/chat/jobs/chat-orchestrator.service';
import { ChatPhotoRecallIntentService } from '@/modules/chat/jobs/chat-photo-recall-intent.service';
import { ChatProcessor } from '@/modules/chat/jobs/chat.processor';
import { ChatQuestionService } from '@/modules/chat/jobs/chat-question.service';
import { ImageReferenceOnlyReplyService } from '@/modules/chat/jobs/image-reference-only-reply.service';
import { JinaReaderService } from '@/modules/chat/jobs/jina-reader.service';
import { LinkContentClassifierService } from '@/modules/chat/jobs/link-content-classifier.service';
import { PhotoAttachmentIntentService } from '@/modules/chat/jobs/photo-attachment-intent.service';
import { PhotoVisionService } from '@/modules/chat/jobs/photo-vision.service';
import { WeeklyReflectionProcessor } from '@/modules/chat/jobs/weekly-reflection.processor';
import { PemAgentLlm } from '@/modules/chat/agents/pem-agent-llm';
import { PemAgentService } from '@/modules/chat/services/pem-agent.service';
import { TriageService } from '@/modules/chat/services/triage.service';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    TranscriptionModule,
    UsersModule,
    EmbeddingsModule,
    forwardRef(() => ExtractsModule),
    ProfileModule,
    SchedulerModule,
    PushModule,
    forwardRef(() => CalendarModule),
    BullModule.registerQueue({ name: 'chat' }),
    BullModule.registerQueue({ name: 'weekly-planning' }),
  ],
  controllers: [ChatController],
  providers: [
    ChatEventsService,
    ChatService,
    ChatImageDedupService,
    ChatStreamService,
    SummarizeTranscriptService,
    BriefCronService,
    ChatProcessor,
    ChatOrchestratorService,
    ChatQuestionService,
    ChatPhotoRecallIntentService,
    ImageReferenceOnlyReplyService,
    PhotoAttachmentIntentService,
    JinaReaderService,
    LinkContentClassifierService,
    ChatLinkPipelineService,
    PhotoVisionService,
    WeeklyReflectionProcessor,
    WeeklyPlanningCronService,
    PemAgentLlm,
    PemAgentService,
    TriageService,
  ],
  exports: [ChatService, ChatEventsService],
})
export class ChatModule {}
