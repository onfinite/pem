import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';

import {
  FALLBACK_INTENT,
  type PrepIntent,
  intentClassificationSchema,
} from './intents/prep-intent';
import { adjustIntentForPlaceDiscovery } from './intents/place-intent-heuristics';
import { buildIntentClassifyPrompt } from './prompts/intent-classify.prompt';

@Injectable()
export class IntentClassifierAgent {
  private readonly log = new Logger(IntentClassifierAgent.name);

  constructor(private readonly config: ConfigService) {}

  /** Classify a single thought (after split). Never throws — returns FALLBACK_INTENT on failure. */
  async classifyThought(thought: string): Promise<PrepIntent> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn('OPENAI_API_KEY missing — intent fallback');
      return FALLBACK_INTENT;
    }
    const trimmed = thought.trim();
    if (!trimmed) {
      return FALLBACK_INTENT;
    }

    const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
    const openai = createOpenAI({ apiKey });

    try {
      const { output } = await generateText({
        model: openai(modelId),
        output: Output.object({ schema: intentClassificationSchema }),
        prompt: buildIntentClassifyPrompt(trimmed),
      });
      if (output?.intent) {
        return adjustIntentForPlaceDiscovery(trimmed, output.intent);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`intent classify failed: ${msg}`);
    }
    return FALLBACK_INTENT;
  }
}
