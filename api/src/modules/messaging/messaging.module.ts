import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '@/database/database.module';
import { AgentModule } from '@/modules/agent/agent.module';
import { CalendarModule } from '@/modules/calendar/calendar.module';
import { ExtractsModule } from '@/modules/extracts/extracts.module';
import { MediaModule } from '@/modules/media/media.module';
import { MemoryModule } from '@/modules/memory/memory.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { PushModule } from '@/modules/push/push.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { ChatEventsService } from '@/modules/messaging/chat-events.service';
import { ChatMessagesForClientService } from '@/modules/messaging/chat-messages-for-client.service';
import { ChatOrchestratorService } from '@/modules/messaging/chat-orchestrator.service';
import { ChatStreamService } from '@/modules/messaging/chat-stream.service';
import { ChatProcessor } from '@/modules/messaging/jobs/chat.processor';
import { SchedulerService } from '@/modules/messaging/scheduler.service';
import { TriageService } from '@/modules/messaging/triage.service';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    MessagesModule,
    MemoryModule,
    MediaModule,
    AgentModule,
    forwardRef(() => ExtractsModule),
    forwardRef(() => CalendarModule),
    ProfileModule,
    PushModule,
    StorageModule,
  ],
  providers: [
    ChatEventsService,
    ChatStreamService,
    ChatMessagesForClientService,
    TriageService,
    SchedulerService,
    ChatOrchestratorService,
    ChatProcessor,
  ],
  exports: [
    ChatEventsService,
    ChatStreamService,
    ChatMessagesForClientService,
    ChatOrchestratorService,
  ],
})
export class MessagingModule {}
