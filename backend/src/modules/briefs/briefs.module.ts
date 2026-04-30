import { Module, forwardRef } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '@/database/database.module';
import { CalendarModule } from '@/modules/calendar/calendar.module';
import { ExtractsModule } from '@/modules/extracts/extracts.module';
import { MemoryModule } from '@/modules/memory/memory.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { PushModule } from '@/modules/push/push.module';
import { BriefBodyLlmService } from '@/modules/briefs/brief-body-llm.service';
import { BriefCronService } from '@/modules/briefs/brief-cron.service';
import { WeeklyReflectionProcessor } from '@/modules/briefs/jobs/weekly-reflection.processor';
import { WeeklyPlanningCronService } from '@/modules/briefs/weekly-planning-cron.service';
import { WeeklyReflectionLlmService } from '@/modules/briefs/weekly-reflection-llm.service';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    MemoryModule,
    forwardRef(() => ExtractsModule),
    forwardRef(() => CalendarModule),
    ProfileModule,
    PushModule,
    BullModule.registerQueue({ name: 'weekly-planning' }),
  ],
  providers: [
    BriefBodyLlmService,
    BriefCronService,
    WeeklyReflectionLlmService,
    WeeklyPlanningCronService,
    WeeklyReflectionProcessor,
  ],
  exports: [BriefCronService],
})
export class BriefsModule {}
