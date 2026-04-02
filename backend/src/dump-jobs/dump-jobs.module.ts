import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { DatabaseModule } from '../database/database.module';
import { PrepEventsModule } from '../events/prep-events.module';
import { ProfileModule } from '../profile/profile.module';
import { DumpProcessor } from './dump.processor';
import { DumpSplitService } from './dump-split.service';

@Module({
  imports: [
    DatabaseModule,
    AgentsModule,
    ProfileModule,
    PrepEventsModule,
    BullModule.registerQueue({ name: 'dump' }),
  ],
  providers: [DumpProcessor, DumpSplitService],
})
export class DumpJobsModule {}
