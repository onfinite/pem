import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { PemAgentService } from '@/agents/pem-agent.service';
import { TriageService } from '@/agents/triage.service';

@Module({
  imports: [DatabaseModule],
  providers: [PemAgentService, TriageService],
  exports: [PemAgentService, TriageService],
})
export class AgentsModule {}
