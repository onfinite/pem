import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

import type { PrepType } from '../database/schemas';

const thoughtSchema = z.object({
  title: z.string().min(1).max(200),
  prepType: z.enum(['search', 'research', 'options', 'draft']),
});

/** Prefer one prep per dump unless the user clearly asked for multiple unrelated tasks. */
const classificationSchema = z.object({
  thoughts: z.array(thoughtSchema).min(1).max(3),
});

export type ClassifiedThought = {
  title: string;
  prepType: PrepType;
};

@Injectable()
export class ClassifyAgent {
  private readonly log = new Logger(ClassifyAgent.name);

  constructor(private readonly config: ConfigService) {}

  async classifyTranscript(transcript: string): Promise<ClassifiedThought[]> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not configured');
    }

    const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
    const openai = createOpenAI({ apiKey });

    const { object } = await generateObject({
      model: openai(modelId),
      schema: classificationSchema,
      prompt: `You turn a user's brain-dump into preps Pem can run. **Default: exactly ONE prep** when the user is asking for one thing, even if they give many constraints in one breath.

Examples of **one** prep (single array element):
- "Gift for mom, she loves gardening, under $60" → ONE options prep (title e.g. "Gift for mom — gardening, ≤$60")
- "Draft an email to cancel my gym" → ONE draft prep
- "What’s the weather in Austin next week" → ONE search prep

Use **two or three** preps **only** when the transcript clearly contains **separate unrelated asks** (e.g. "First help me with X. Also unrelated: do Y." or a numbered list of different tasks). Do not split one shopping/gift/decision ask into multiple preps.

Prep types (pick one per thought):
- search: quick fact, price check, current info
- research: bigger synthesis, decision support, multi-source comparison
- options: product/gift picks, shopping-style recommendations (downstream returns up to 3 picks)
- draft: user wants an email/message/text written

Transcript:
"""
${transcript.slice(0, 12000)}
"""

Return JSON only via schema. Titles are short card titles (no markdown).`,
    });

    this.log.log(`classified ${object.thoughts.length} thought(s)`);
    return object.thoughts;
  }
}
