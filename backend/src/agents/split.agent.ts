import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const thoughtEl = z.object({
  thought: z.string().min(1).max(400),
});

/**
 * Splits a raw dump into independent actionable thoughts (one prep each).
 */
@Injectable()
export class SplitAgent {
  private readonly log = new Logger(SplitAgent.name);

  constructor(private readonly config: ConfigService) {}

  async splitTranscript(transcript: string): Promise<string[]> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
    const openai = createOpenAI({ apiKey });

    const { output } = await generateText({
      model: openai(modelId),
      output: Output.array({
        element: thoughtEl,
        name: 'thoughts',
        description: 'Distinct actionable thoughts from the dump',
      }),
      prompt: `Extract separate actionable thoughts from this brain dump. Each thought should be one concrete thing the user wants done (task, decision, research, draft, purchase, etc.).

Rules:
- Prefer multiple thoughts only when the user clearly mixed unrelated asks (e.g. cancel gym AND sell car AND email landlord).
- If it is one coherent ask with constraints, return exactly ONE thought.
- Titles: short, no markdown.

Dump:
"""
${transcript.slice(0, 12_000)}
"""`,
    });

    const list = output ?? [];
    const thoughts = list.map((t) => t.thought.trim()).filter(Boolean);
    this.log.log(`split into ${thoughts.length} thought(s)`);
    return thoughts;
  }
}
