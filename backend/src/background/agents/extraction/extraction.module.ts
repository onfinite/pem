import { Module } from '@nestjs/common';

import { ExtractAgentService } from './extract-agent.service';
import { ReconcileAgentService } from './reconcile-agent.service';
import { ValidationService } from './validation.service';

@Module({
  providers: [ExtractAgentService, ReconcileAgentService, ValidationService],
  exports: [ExtractAgentService, ReconcileAgentService, ValidationService],
})
export class ExtractionModule {}
