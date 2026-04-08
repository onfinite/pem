import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

const SYSTEM = `You are Pem, a calm personal thought organizer. Write a brief 1-2 sentence summary of the user's day. Speak directly to them in second person. Be warm, concise, and grounding — like a smart friend who glanced at their calendar. Never list tasks. Never use bullet points. Never sound robotic or productivity-obsessed. The tone is relief, not pressure.

Examples:
- "Quiet day — just one errand and a call to make. The rest can wait."
- "Two things before lunch, then you're free. Nothing urgent."
- "Full morning, easy afternoon. Start with the dentist at 9."
- "Nothing on the books. Clear mind, clear day."`;

type BriefCounts = {
  overdue: number;
  today: number;
  tomorrow: number;
  this_week: number;
  todayItems: string[];
};

@Injectable()
export class BriefStatementService {
  private readonly log = new Logger(BriefStatementService.name);
  private readonly openai;
  private readonly model: string;

  constructor(private readonly config: ConfigService) {
    this.openai = createOpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
    });
    this.model = this.config.get<string>('OPENAI_AGENT_MODEL') ?? 'gpt-4o';
  }

  async generate(counts: BriefCounts): Promise<string> {
    const prompt = [
      `Overdue: ${counts.overdue}`,
      `Today: ${counts.today}${counts.todayItems.length > 0 ? ` (${counts.todayItems.join(', ')})` : ''}`,
      `Tomorrow: ${counts.tomorrow}`,
      `This week: ${counts.this_week}`,
    ].join('\n');

    try {
      const { text } = await generateText({
        model: this.openai(this.model),
        system: SYSTEM,
        prompt,
        maxOutputTokens: 80,
        temperature: 0.7,
      });
      return text.trim();
    } catch (e) {
      this.log.warn(
        `Statement generation failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return this.fallback(counts);
    }
  }

  fallback(c: BriefCounts): string {
    if (c.overdue > 0 && c.today > 0)
      return `${c.overdue} overdue and ${c.today} for today. Let\u2019s clear the overdue first.`;
    if (c.overdue > 0)
      return `${c.overdue} overdue. Let\u2019s handle ${c.overdue === 1 ? 'it' : 'those'} first.`;
    if (c.today === 0 && c.tomorrow === 0 && c.this_week === 0)
      return 'Your mind is clear. Dump a thought whenever you need to \u2014 I\u2019ll organize it.';
    if (c.today === 0 && c.tomorrow > 0)
      return `Nothing for today. ${c.tomorrow} ${c.tomorrow === 1 ? 'thing' : 'things'} lined up for tomorrow.`;
    if (c.today === 0) return 'Nothing needs you today. Enjoy the quiet.';
    if (c.today === 1)
      return 'Just one thing today \u2014 nothing loud, just a thread to pull when ready.';
    if (c.today <= 3)
      return `${c.today} things today. All manageable \u2014 pick what matters.`;
    return `${c.today} things on your plate. Start anywhere; the rest will wait.`;
  }
}
