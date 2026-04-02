import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PushModule } from '../push/push.module';
import { ClassifyAgent } from './classify.agent';
import { PrepRunnerService } from './prep-runner.service';

@Module({
  imports: [DatabaseModule, IntegrationsModule, PushModule],
  providers: [ClassifyAgent, PrepRunnerService],
  exports: [ClassifyAgent, PrepRunnerService],
})
export class AgentsModule {}
