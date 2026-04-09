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
        system: `You classify messages sent to Pem, an AI life assistant that manages tasks, calendar, thoughts, and personal context.

Rules:
- If the message is ONLY "ok", "thanks", "got it", "hi", "hey", emoji-only, or similar 1-3 word small talk with ZERO informational content → trivial
- If the message is purely asking a question (what's on my calendar, what did I say about X, how many tasks do I have) → question_only
- If the message contains ANY of the following → needs_agent:
  - Things to do, buy, grab, pick up, handle, or remember ("I need to grab diapers", "don't forget milk")
  - Reminders, plans, scheduling, commands ("cancel X", "add Y to calendar")
  - Journaling, emotional dumping, venting
  - Personal goals, visions, aspirations, life context ("my goal is to become X", "I want to be Y")
  - Preferences, habits, facts about themselves ("I'm vegetarian", "I live in SF")
  - Mixed content with both questions and tasks
  - ANY sentence longer than a few words that shares information about the user's life
- When in doubt between trivial and needs_agent, choose needs_agent
- When in doubt between question_only and needs_agent, choose needs_agent
- People sometimes ask rhetorical questions while dumping thoughts — that is needs_agent, not question_only
- IMPORTANT: "trivial" is ONLY for pure greetings and acknowledgments with zero content. If the user shares ANYTHING about their life, plans, feelings, or goals, that is needs_agent.`,
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
