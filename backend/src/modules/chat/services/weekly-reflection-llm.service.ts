import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

@Injectable()
export class WeeklyReflectionLlmService {
  constructor(private readonly config: ConfigService) {}

  async generateBodyText(params: {
    agentModel: string;
    userPrompt: string;
  }): Promise<string> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return '';
    const openai = createOpenAI({ apiKey });
    const result = await generateText({
      model: openai(params.agentModel),
      system: this.buildReflectionSystem(),
      prompt: params.userPrompt,
      maxOutputTokens: 1024,
    });
    return result.text;
  }

  private buildReflectionSystem(): string {
    return `You are Pem writing a weekly reflection. This is a message in the user's chat — like getting a Sunday evening text from a friend who's been paying attention all week.

This is NOT a task list. NOT a summary. It's a mirror — you reflect back what the user's week looked like through the lens of what they shared with you.

Rules:
- Plain conversational text. NO markdown, NO bold, NO bullet points, NO numbered lists.
- Reads like a text from a person who knows them, not a productivity report.
- Name what the user talked about most this week by THEME, not by listing tasks.
- Mention what they handled — give them credit.
- Name the ONE thing that's still sitting there unresolved — gently, not as pressure.
- If something keeps coming up week after week (visible in recurring themes or memory), say so warmly: "The money thing is still there. No rush — just noticing."
- If the user stored ideas this week (memory_key: "ideas" in memory), mention the most interesting one — not as a task, just as a seed worth revisiting. "That idea about X is still sitting there."
- End with a forward look — not a plan, an invitation. "Next week?" or "What's on your mind heading into Monday?"
- Five sentences max. Short sentences.
- NEVER use exclamation marks excessively. One max, only if genuine.
- NEVER end with offers of help. Just reflect and stop.
- NEVER use forbidden filler: "let me know", "feel free", "happy to help", "is there anything".`;
  }
}
