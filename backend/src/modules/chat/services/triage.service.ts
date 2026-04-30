import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import type { TriageCategory } from '@/database/schemas/messages.schema';
import { logWithContext } from '@/core/utils/format-log-context';

export type { TriageCategory } from '@/database/schemas/messages.schema';

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

const TRIAGE_SYSTEM = `You classify messages sent to Pem, an AI life organizer and friend.

Rules:
- trivial is EXTREMELY narrow: ONLY "ok", "thanks", "got it", "cool", emoji-only, thumbs up — pure acknowledgments with ZERO informational or conversational content. "hi" and "hey" are NOT trivial — they are conversation starters → needs_agent.
- Bare "yes", "sure", "ok", "please" right after Pem offered to add something from a photo they just described → needs_agent (they are confirming an action), NOT trivial.
- Questions about Pem itself ("who are you?", "who r u?", "what can you do?", "what's your name?", "how do you work?") → needs_agent. These are NEVER trivial or off_topic.
- Personal sharing, feelings, venting, opinions, stories, conversation → needs_agent. Pem is a friend and listener.
- Commands to modify tasks/calendar ("clear my afternoon", "cancel X", "reschedule Y", "delete Z") → needs_agent.
- Recall / memory questions ("do you remember X?", "what were we talking about last month?", "when did we discuss Y?", "what did we talk about today?", "what do you know about Z?", "who is X?") → question_only.
- Past chat photos ("bring up photos from…", "show me pictures I sent", "photos from my LA trip") or factual recall of a past chat topic/person answerable from messages/memory ("what did we discuss with Farin?") → question_only (not the open web). If the message is mostly venting, journaling, or mixed with commands → needs_agent.
- Brief/overview requests about their own data ("what's my week look like", "brief me") → question_only.
- Pure data lookups about their tasks/lists/calendar ("what's on my list?", "what's tomorrow?") → question_only.
- Requests for factual internet knowledge Pem genuinely cannot answer (weather forecasts, stock prices, sports scores, math homework, Wikipedia facts) → off_topic.
- Dumps, things to buy/do/remember, scheduling, journaling, preferences, life context → needs_agent.
- Commitments and habits with "I must …", "I have to …" (run every day, wake at 6am, etc.) → needs_agent — they are new work to capture, not a lookup about existing tasks.
- When in doubt → needs_agent. Always.`;

@Injectable()
export class TriageService {
  private readonly log = new Logger(TriageService.name);

  constructor(private readonly config: ConfigService) {}

  async classify(content: string): Promise<TriageCategory> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return 'needs_agent';

    try {
      const model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
      const openai = createOpenAI({ apiKey });
      const { output } = await generateText({
        model: openai(model),
        output: Output.object({ schema: triageCategorySchema }),
        temperature: 0,
        system: TRIAGE_SYSTEM,
        prompt: `Classify this message:\n"""${content.slice(0, 2000)}"""`,
        maxRetries: 2,
        providerOptions: { openai: { strictJsonSchema: false } },
      });
      return output?.category ?? 'needs_agent';
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
