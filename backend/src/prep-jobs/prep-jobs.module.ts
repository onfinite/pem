import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { PrepProcessor } from './prep.processor';

@Module({
  imports: [AgentsModule],
  providers: [PrepProcessor],
  exports: [PrepProcessor],
})
export class PrepJobsModule {}
