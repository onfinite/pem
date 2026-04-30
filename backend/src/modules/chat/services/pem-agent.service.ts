import { Injectable } from '@nestjs/common';

import type { PemAgentOutput } from '@/modules/chat/types/pem-agent.types';
import { PemAgentLlmService } from '@/modules/chat/services/pem-agent-llm.service';

type PemAgentRunParams = Parameters<PemAgentLlmService['run']>[0];

@Injectable()
export class PemAgentService {
  constructor(private readonly llm: PemAgentLlmService) {}

  run(params: PemAgentRunParams): Promise<PemAgentOutput> {
    return this.llm.run(params);
  }
}
