import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { PrepProcessor } from './prep.processor';

@Module({
  imports: [
    /** Same pattern as `DumpJobsModule` + `dump` queue: processor module registers the queue it consumes. */
    BullModule.registerQueue({ name: 'prep' }),
    AgentsModule,
  ],
  providers: [PrepProcessor],
  exports: [PrepProcessor],
})
export class PrepJobsModule {}
