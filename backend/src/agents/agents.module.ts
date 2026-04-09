import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PemAgentService } from './pem-agent.service';
import { TriageService } from './triage.service';

@Module({
  imports: [DatabaseModule],
  providers: [PemAgentService, TriageService],
  exports: [PemAgentService, TriageService],
})
export class AgentsModule {}
