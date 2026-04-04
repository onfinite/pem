import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PrepEventsModule } from '../events/prep-events.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { PrepsModule } from '../preps/preps.module';
import { ProfileModule } from '../profile/profile.module';
import { PushModule } from '../push/push.module';
import { StepsModule } from '../steps/steps.module';
import { IntentClassifierAgent } from './intent-classifier.agent';
import { PrepRunnerService } from './prep-runner.service';
import { SplitAgent } from './split.agent';

@Module({
  imports: [
    DatabaseModule,
    IntegrationsModule,
    PushModule,
    ProfileModule,
    PrepsModule,
    StepsModule,
    PrepEventsModule,
  ],
  providers: [SplitAgent, IntentClassifierAgent, PrepRunnerService],
  exports: [SplitAgent, IntentClassifierAgent, PrepRunnerService],
})
export class AgentsModule {}
