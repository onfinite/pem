import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { TriageCategory } from '@/database/schemas/messages.schema';
import { logWithContext } from '@/core/utils/format-log-context';
import { classifyTriageWithLlm } from '@/modules/chat/agents/triage-llm';

export type { TriageCategory } from '@/database/schemas/messages.schema';

@Injectable()
export class TriageService {
  private readonly log = new Logger(TriageService.name);

  constructor(private readonly config: ConfigService) {}

  async classify(content: string): Promise<TriageCategory> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return 'needs_agent';

    try {
      const model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
      return await classifyTriageWithLlm({
        apiKey,
        modelId: model,
        content,
      });
    } catch (e) {
      this.log.warn(
        logWithContext('Triage classification failed', {
          scope: 'triage',
          err: e instanceof Error ? e.message : 'unknown',
        }),
      );
      return 'needs_agent';
    }
  }
}
