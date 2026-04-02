import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PrepEventsModule } from '../events/prep-events.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { ProfileModule } from '../profile/profile.module';
import { PushModule } from '../push/push.module';
import { StepsModule } from '../steps/steps.module';
import { PrepRunnerService } from './prep-runner.service';
import { SplitAgent } from './split.agent';

@Module({
  imports: [
    DatabaseModule,
    IntegrationsModule,
    PushModule,
    ProfileModule,
    StepsModule,
    PrepEventsModule,
  ],
  providers: [SplitAgent, PrepRunnerService],
  exports: [SplitAgent, PrepRunnerService],
})
export class AgentsModule {}
