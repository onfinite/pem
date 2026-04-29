import { Injectable } from '@nestjs/common';

import type { PemAgentOutput } from '@/modules/chat/types/pem-agent.types';
import { PemAgentLlm } from '@/modules/chat/agents/pem-agent-llm';

type PemAgentRunParams = Parameters<PemAgentLlm['run']>[0];

@Injectable()
export class PemAgentService {
  constructor(private readonly llm: PemAgentLlm) {}

  run(params: PemAgentRunParams): Promise<PemAgentOutput> {
    return this.llm.run(params);
  }
}
