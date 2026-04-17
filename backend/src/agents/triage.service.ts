import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const triageCategorySchema = z.object({
  category: z
    .enum(['trivial', 'question_only', 'off_topic', 'needs_agent'])
    .describe(
      `trivial: ONLY pure acknowledgments with zero content — "ok", "thanks", "got it", emoji-only, thumbs up. Nothing else is trivial.
question_only: user asks something answerable from THEIR Pem data — open tasks, shopping list, calendar, memory, ideas from memory, what they said before. NOT weather, news, trivia, homework, or the wider internet.
off_topic: requests for factual internet knowledge that Pem genuinely cannot answer — weather forecasts, sports scores, stock prices, math/coding homework, Wikipedia-style facts. NOT personal sharing, NOT questions about Pem, NOT conversation.
needs_agent: everything else — dumping thoughts, commands, journaling, venting, sharing, conversation, questions about Pem itself ("who are you?", "what can you do?"), things to buy/do/remember, scheduling, mixed content, personal sharing, feelings, opinions. When in doubt → needs_agent.`,
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
        temperature: 0,
        system: `You classify messages sent to Pem, an AI life organizer and friend.

Rules:
- trivial is EXTREMELY narrow: ONLY "ok", "thanks", "got it", "cool", emoji-only, thumbs up — pure acknowledgments with ZERO informational or conversational content. "hi" and "hey" are NOT trivial — they are conversation starters → needs_agent.
- Questions about Pem itself ("who are you?", "who r u?", "what can you do?", "what's your name?", "how do you work?") → needs_agent. These are NEVER trivial or off_topic.
- Personal sharing, feelings, venting, opinions, stories, conversation → needs_agent. Pem is a friend and listener.
- Commands to modify tasks/calendar ("clear my afternoon", "cancel X", "reschedule Y", "delete Z") → needs_agent.
- Recall / memory questions ("do you remember X?", "what were we talking about last month?", "what do you know about Z?", "who is X?") → question_only.
- Brief/overview requests about their own data ("what's my week look like", "brief me") → question_only.
- Pure data lookups about their tasks/lists/calendar ("what's on my list?", "what's tomorrow?") → question_only.
- Requests for factual internet knowledge Pem genuinely cannot answer (weather forecasts, stock prices, sports scores, math homework, Wikipedia facts) → off_topic.
- Dumps, things to buy/do/remember, scheduling, journaling, preferences, life context → needs_agent.
- When in doubt → needs_agent. Always.`,
        prompt: `Classify this message:\n"""${content.slice(0, 2000)}"""`,
        maxRetries: 2,
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
