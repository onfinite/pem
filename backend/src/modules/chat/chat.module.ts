import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { CalendarModule } from '@/modules/calendar/calendar.module';
import { DatabaseModule } from '@/database/database.module';
import { ExtractsModule } from '@/modules/extracts/extracts.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { PushModule } from '@/modules/push/push.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { UsersModule } from '@/modules/users/users.module';
import { BriefCronService } from '@/modules/chat/services/brief-cron.service';
import { ChatEventsService } from '@/modules/chat/services/chat-events.service';
import { ChatImageDedupService } from '@/modules/chat/services/chat-image-dedup.service';
import { ChatController } from '@/modules/chat/chat.controller';
import { ChatMessageSignedMediaService } from '@/modules/chat/services/chat-message-signed-media.service';
import { ChatMessagesForClientService } from '@/modules/chat/services/chat-messages-for-client.service';
import { ChatService } from '@/modules/chat/services/chat.service';
import { EmbeddingsService } from '@/modules/chat/services/embeddings.service';
import { ChatStreamService } from '@/modules/chat/services/chat-stream.service';
import { ChatVoiceUploadService } from '@/modules/chat/services/chat-voice-upload.service';
import { SummarizeTranscriptService } from '@/modules/chat/services/summarize-transcript.service';
import { TranscriptionService } from '@/modules/chat/services/transcription.service';
import { WeeklyPlanningCronService } from '@/modules/chat/services/weekly-planning-cron.service';
import { ChatLinkPipelineService } from '@/modules/chat/services/chat-link-pipeline.service';
import { OgHtmlReaderService } from '@/modules/chat/services/og-html-reader.service';
import { ChatOrchestratorService } from '@/modules/chat/services/chat-orchestrator.service';
import { ChatPhotoRecallIntentService } from '@/modules/chat/services/chat-photo-recall-intent.service';
import { ChatProcessor } from '@/modules/chat/jobs/chat.processor';
import { ChatQuestionService } from '@/modules/chat/services/chat-question.service';
import { ImageReferenceOnlyReplyService } from '@/modules/chat/services/image-reference-only-reply.service';
import { PhotoAttachmentIntentService } from '@/modules/chat/services/photo-attachment-intent.service';
import { PhotoVisionService } from '@/modules/chat/services/photo-vision.service';
import { WeeklyReflectionProcessor } from '@/modules/chat/jobs/weekly-reflection.processor';
import { PemAgentLlmService } from '@/modules/chat/services/pem-agent-llm.service';
import { OrchestratorLlmService } from '@/modules/chat/services/orchestrator-llm.service';
import { WeeklyReflectionLlmService } from '@/modules/chat/services/weekly-reflection-llm.service';
import { BriefBodyLlmService } from '@/modules/chat/services/brief-body-llm.service';
import { ChatQuestionLlmService } from '@/modules/chat/services/chat-question-llm.service';
import { ChatPhotoRecallIntentLlmService } from '@/modules/chat/services/chat-photo-recall-intent-llm.service';
import { PemAgentService } from '@/modules/chat/services/pem-agent.service';
import { SchedulerService } from '@/modules/chat/services/scheduler.service';
import { TriageService } from '@/modules/chat/services/triage.service';

@Module({
  imports: [
    DatabaseModule,
    StorageModule,
    UsersModule,
    forwardRef(() => ExtractsModule),
    ProfileModule,
    PushModule,
    forwardRef(() => CalendarModule),
    BullModule.registerQueue({ name: 'chat' }),
    BullModule.registerQueue({ name: 'weekly-planning' }),
  ],
  controllers: [ChatController],
  providers: [
    ChatEventsService,
    ChatMessageSignedMediaService,
    ChatMessagesForClientService,
    ChatService,
    ChatVoiceUploadService,
    ChatImageDedupService,
    ChatStreamService,
    EmbeddingsService,
    SummarizeTranscriptService,
    TranscriptionService,
    BriefCronService,
    BriefBodyLlmService,
    ChatProcessor,
    ChatOrchestratorService,
    OrchestratorLlmService,
    ChatQuestionService,
    ChatQuestionLlmService,
    ChatPhotoRecallIntentService,
    ChatPhotoRecallIntentLlmService,
    ImageReferenceOnlyReplyService,
    PhotoAttachmentIntentService,
    ChatLinkPipelineService,
    OgHtmlReaderService,
    PhotoVisionService,
    WeeklyReflectionProcessor,
    WeeklyReflectionLlmService,
    WeeklyPlanningCronService,
    PemAgentLlmService,
    PemAgentService,
    SchedulerService,
    TriageService,
  ],
  exports: [ChatService, ChatEventsService],
})
export class ChatModule {}
