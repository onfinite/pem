import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

const triageCategorySchema = z.object({
  category: z
    .enum(['trivial', 'question_only', 'off_topic', 'needs_agent'])
    .describe(
      `trivial: greetings, thanks, acknowledgments, small talk — no processing needed.
question_only: user asks something answerable ONLY from THEIR Pem data — open tasks, shopping list, ideas list, calendar, memory, what they said before in this app. NOT weather, news, trivia, homework, or the wider internet.
off_topic: general knowledge, weather, sports scores, news, "what is...", math/coding homework, unrelated debates, or chit-chat that is not about the user's life or Pem data — Pem should not engage as a general assistant.
needs_agent: dumping thoughts, commands to add/update/complete tasks, journaling, venting, things to buy/do/remember, memory triggers ("remember that..."), scheduling, mixed question+task — full agent.`,
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
        system: `You classify messages sent to Pem, an AI life assistant that organizes the user's tasks, calendar, thoughts, and memory — not a general-purpose chatbot.

Rules:
- If the message is ONLY "ok", "thanks", "got it", "hi", "hey", emoji-only, or similar 1-3 word small talk with ZERO informational content → trivial
- If the message asks for weather, news, facts about the world, homework answers, or anything NOT stored in Pem → off_topic
- If the message is ONLY a question that could be answered from the user's tasks, lists, calendar, or memory in Pem (e.g. "what's on my list", "did I say milk", "what's tomorrow") → question_only
- If the user only asks for a summary / overview / "brief" of their day or a future window using ONLY their Pem data (e.g. "Brief me only.", "Brief me only on tomorrow.", "what's my week look like" as an overview, not mixed with new to-dos) → question_only
- If the message contains ANY of the following → needs_agent (unless the ENTIRE message is only a brief/overview request as above):
  - Things to do, buy, grab, pick up, handle, or remember ("I need to grab diapers", "don't forget milk")
  - Learning or skill commitments in journal voice ("I'll need to learn sales", "I should study for X", "need to get better at Y")
  - Reminders, plans, scheduling, commands ("cancel X", "add Y to calendar")
  - Journaling, emotional dumping, venting
  - Personal goals, visions, aspirations, life context ("my goal is to become X", "I want to be Y")
  - Ideas, brainstorms, creative thoughts ("thinking of starting…", "wouldn't it be cool if…", "what if there was…")
  - Preferences, habits, facts about themselves ("I'm vegetarian", "I live in SF")
  - Memory requests: "remember that...", "keep in mind...", "note that...", "add to your knowledgebase...", "don't forget that...", "FYI...", "just so you know...", "for future reference...", "save this...", "know that..."
  - Mixed content with both questions and tasks
  - ANY sentence longer than a few words that shares information about the user's life
- When in doubt between trivial and needs_agent, choose needs_agent
- When in doubt between question_only and needs_agent, choose needs_agent
- When in doubt between off_topic and question_only: if it needs the internet or world facts → off_topic; if it needs only their saved Pem data → question_only
- People sometimes ask rhetorical questions while dumping thoughts — that is needs_agent, not question_only
- IMPORTANT: "trivial" is ONLY for pure greetings and acknowledgments with zero content. If the user shares ANYTHING about their life, plans, feelings, or goals, that is needs_agent.`,
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
