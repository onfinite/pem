import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const triageCategorySchema = z.object({
  category: z.enum(['trivial', 'question_only', 'needs_agent']).describe(
    `trivial: greetings, thanks, acknowledgments, small talk — no processing needed.
question_only: user is asking a question about their data, schedule, tasks, or general knowledge — answer directly, no task extraction.
needs_agent: user is dumping thoughts, giving commands, asking to create/update/complete tasks, mentioning things to do, journaling, or mixed content — needs full agent processing.`,
  ),
  reasoning: z.string().describe('One sentence why this category was chosen.'),
});

export type TriageCategory = z.infer<typeof triageCategorySchema>['category'];

@Injectable()
export class TriageService {
  private readonly log = new Logger(TriageService.name);

  constructor(private readonly config: ConfigService) {}

  async classify(content: string): Promise<TriageCategory> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return 'needs_agent';

    try {
      const openai = createOpenAI({ apiKey });
      const model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

      const { output } = await generateText({
        model: openai(model),
        output: Output.object({ schema: triageCategorySchema }),
        system: `You classify messages sent to Pem, an AI life assistant that manages tasks, calendar, and thoughts.

Rules:
- If the message is just "ok", "thanks", "got it", "hi", emoji-only, or similar small talk → trivial
- If the message is purely asking a question (what's on my calendar, what did I say about X, how many tasks do I have) → question_only
- If the message contains ANY actionable content (things to do, reminders, plans, journaling, emotional dumping, commands like "cancel X" or "add Y to calendar", or mixed content with both questions and tasks) → needs_agent
- When in doubt between question_only and needs_agent, choose needs_agent
- People sometimes ask rhetorical questions while dumping thoughts — that is needs_agent, not question_only`,
        prompt: `Classify this message:\n"""${content.slice(0, 2000)}"""`,
        providerOptions: { openai: { strictJsonSchema: false } },
      });

      return output?.category ?? 'needs_agent';
    } catch (e) {
      this.log.warn(
        `Triage failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return 'needs_agent';
    }
  }
}
