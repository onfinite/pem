import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';

import { CalendarModule } from '../calendar/calendar.module';
import { ExtractsModule } from '../extracts/extracts.module';
import { DatabaseModule } from '../database/database.module';
import { ProfileModule } from '../profile/profile.module';
import { PushModule } from '../push/push.module';
import { AgentsModule } from '../agents/agents.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { ChatEventsModule } from './chat-events/chat-events.module';
import { BriefCronService } from './queues/brief/brief-cron.service';
import { CalendarCronService } from './queues/calendar/calendar-cron.service';
import { CalendarSyncProcessor } from './queues/calendar/calendar-sync.processor';
import { ChatOrchestratorService } from './queues/chat/chat-orchestrator.service';
import { ChatProcessor } from './queues/chat/chat.processor';
import { ChatQuestionService } from './queues/chat/chat-question.service';
import { ReminderCronService } from './queues/reminder/reminder-cron.service';
import { RecurrenceCronService } from './queues/scheduler/recurrence-cron.service';
import { WeeklyReflectionProcessor } from './queues/weekly/weekly-reflection.processor';

@Global()
@Module({
  imports: [
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redisUrl');
        if (!url) {
          throw new Error(
            'REDIS_URL is required (BullMQ). Set it in .env for the worker queue.',
          );
        }
        return {
          connection: { url },
          defaultJobOptions: {
            removeOnFail: { count: 200 },
          },
        };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: 'chat' },
      { name: 'calendar-sync' },
      { name: 'weekly-planning' },
      { name: 'scheduling' },
      { name: 'brief' },
    ),
    CalendarModule,
    DatabaseModule,
    ProfileModule,
    ExtractsModule,
    AgentsModule,
    ChatEventsModule,
    EmbeddingsModule,
    SchedulerModule,
    TranscriptionModule,
    PushModule,
  ],
  providers: [
    ChatProcessor,
    ChatOrchestratorService,
    ChatQuestionService,
    BriefCronService,
    CalendarSyncProcessor,
    CalendarCronService,
    RecurrenceCronService,
    ReminderCronService,
    WeeklyReflectionProcessor,
  ],
  exports: [BullModule, ChatEventsModule, ChatQuestionService, BriefCronService],
})
export class BackgroundModule {}
