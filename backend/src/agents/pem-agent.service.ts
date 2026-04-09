import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';

const extractActionSchema = z.object({
  text: z.string().describe('Clean, concise task text'),
  original_text: z.string().describe('Raw fragment from the message'),
  tone: z.enum(['confident', 'tentative', 'idea', 'someday']),
  urgency: z.enum(['today', 'this_week', 'someday', 'none']),
  batch_key: z.enum(['shopping', 'errands', 'follow_ups']).nullable(),
  due_at: z.string().nullable().describe('ISO datetime if detected'),
  period_start: z.string().nullable(),
  period_end: z.string().nullable(),
  period_label: z.string().nullable(),
  pem_note: z.string().nullable().describe('Brief context note from Pem'),
  draft_text: z
    .string()
    .nullable()
    .describe('Draft message if follow_ups batch'),
});

const updateActionSchema = z.object({
  extract_id: z.string().describe('ID of existing extract to update'),
  patch: z.object({
    text: z.string().optional(),
    tone: z.enum(['confident', 'tentative', 'idea', 'someday']).optional(),
    urgency: z.enum(['today', 'this_week', 'someday', 'none']).optional(),
    batch_key: z
      .enum(['shopping', 'errands', 'follow_ups'])
      .nullable()
      .optional(),
    due_at: z.string().nullable().optional(),
    period_start: z.string().nullable().optional(),
    period_end: z.string().nullable().optional(),
    period_label: z.string().nullable().optional(),
    pem_note: z.string().nullable().optional(),
    draft_text: z.string().nullable().optional(),
  }),
  reason: z.string().describe('Why this update is being made'),
});

const completeActionSchema = z.object({
  extract_id: z.string(),
  command: z.enum(['mark_done', 'dismiss', 'snooze']),
  snooze_until_iso: z.string().nullable().optional(),
  reason: z.string(),
});

const calendarWriteSchema = z.object({
  summary: z.string(),
  start_at: z.string().describe('ISO datetime'),
  end_at: z.string().describe('ISO datetime'),
  location: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  linked_new_item_index: z
    .number()
    .nullable()
    .optional()
    .describe('Index into creates array if linking to a new extract'),
});

const memoryWriteSchema = z.object({
  memory_key: z
    .string()
    .describe('Category key like "preferences", "family", "work"'),
  note: z.string().describe('The fact to remember'),
});

export const pemAgentOutputSchema = z.object({
  response_text: z
    .string()
    .describe(
      "Pem's conversational response to the user. Natural, warm, concise. No markdown.",
    ),
  creates: z.array(extractActionSchema).describe('New tasks/items to create'),
  updates: z.array(updateActionSchema).describe('Existing tasks to modify'),
  completions: z
    .array(completeActionSchema)
    .describe('Tasks to mark done/dismiss/snooze'),
  calendar_writes: z
    .array(calendarWriteSchema)
    .describe('Calendar events to create'),
  memory_writes: z
    .array(memoryWriteSchema)
    .describe('Facts to remember about the user'),
  polished_text: z
    .string()
    .nullable()
    .describe('Cleaned up version of the user message for the thought log'),
});

export type PemAgentOutput = z.infer<typeof pemAgentOutputSchema>;
export type ExtractAction = z.infer<typeof extractActionSchema>;

const SYSTEM = `You are Pem, the user's trusted personal assistant who manages their life. You live in a WhatsApp-style chat. The user dumps thoughts, asks questions, gives commands, journals — anything. You handle it all in one response.

Your personality:
- Warm but efficient. Like a smart friend who actually remembers everything.
- Never robotic. Never use bullet points or markdown. Write naturally.
- Acknowledge emotions when present. "That sounds frustrating" before jumping to tasks.
- Be proactive: if the user mentions buying groceries and you know they have a shopping list, mention it.

Rules for task extraction:
- Extract EVERY actionable item as its OWN separate task. "potatoes and tomatoes" = TWO tasks, not one.
- Use the user's natural language for task text — don't over-formalize.
- Food items (fruits, vegetables, meat, dairy, snacks, ingredients) → batch_key: "shopping". These are things to BUY and EAT, not plant or grow. "I need potatoes" = "Buy potatoes" [shopping]. Never assume gardening unless the user explicitly says "plant", "garden", or "grow".
- Errands (physical chores: laundry, dry cleaning, pharmacy, pick up, drop off, return) → batch_key: "errands".
- Calls/texts/emails/reaching out to someone → batch_key: "follow_ups".
- When user says "I did X" or "X is done" or "I bought X" or "got the X" → find the matching extract and mark it done.
- When user says "never mind about X" or "forget X" → dismiss the matching extract.
- When user updates an existing task (adds detail, changes timing), update it — don't create a duplicate.
- Dates: "tomorrow" means the next day. "this weekend" means Saturday AND Sunday. "next week" starts Monday.
- Be smart about deduplication. If "buy milk" already exists, don't create it again.
- Default to the most common-sense interpretation. People buy groceries to eat, pick up prescriptions to take, etc.

Rules for your response:
- Keep it conversational. 1-4 sentences usually.
- Summarize what you did: "Got it — added milk to your shopping list and scheduled the dentist for Thursday at 2pm."
- If nothing actionable was found, just acknowledge warmly.
- If the user is journaling or venting, acknowledge their feelings. Don't try to extract tasks from emotional content unless there's a clear action item.
- NEVER use markdown, bold, asterisks, or bullet lists. Plain text only.

Context handling:
- You receive the user's open tasks, calendar events, and memory facts.
- Use this context to avoid duplicates, to mark things done when mentioned, and to make connections.
- If the user's timezone is known, interpret relative dates accordingly.`;

@Injectable()
export class PemAgentService {
  private readonly log = new Logger(PemAgentService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
  ) {}

  async run(params: {
    messageContent: string;
    userTimezone: string | null;
    openExtracts: {
      id: string;
      text: string;
      status: string;
      tone: string;
      urgency: string;
      batch_key: string | null;
      due_at: string | null;
      period_label: string | null;
    }[];
    calendarEvents: {
      summary: string;
      start_at: string;
      end_at: string;
      location: string | null;
    }[];
    memorySection: string;
    recentMessages: { role: string; content: string; created_at: string }[];
    ragContext: string;
  }): Promise<PemAgentOutput> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const openai = createOpenAI({ apiKey });
    const agentModel = this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

    const now = new Date();
    const tzLabel = params.userTimezone ?? 'UTC';

    const openTasksSection =
      params.openExtracts.length > 0
        ? params.openExtracts
            .map((e) => {
              const parts = [e.text];
              if (e.due_at) parts.push(`due: ${e.due_at}`);
              if (e.period_label) parts.push(e.period_label);
              if (e.batch_key) parts.push(`[${e.batch_key}]`);
              return `- [${e.id}] ${parts.join(' | ')} (${e.status}, ${e.urgency})`;
            })
            .join('\n')
        : '(no open tasks)';

    const calendarSection =
      params.calendarEvents.length > 0
        ? params.calendarEvents
            .map((e) => {
              const loc = e.location ? ` at ${e.location}` : '';
              return `- ${e.summary}: ${e.start_at} to ${e.end_at}${loc}`;
            })
            .join('\n')
        : '(no upcoming events)';

    const recentSection =
      params.recentMessages.length > 0
        ? params.recentMessages
            .map(
              (m) =>
                `[${m.created_at}] ${m.role === 'user' ? 'User' : 'Pem'}: ${m.content?.slice(0, 300) ?? ''}`,
            )
            .join('\n')
        : '';

    const prompt = `Current time: ${now.toISOString()} (user timezone: ${tzLabel})

## Open tasks
${openTasksSection}

## Calendar (upcoming)
${calendarSection}

## Memory
${params.memorySection || '(none yet)'}

## Recent conversation
${recentSection || '(start of conversation)'}

${params.ragContext ? `## Related past context\n${params.ragContext}\n` : ''}
## User message
"${params.messageContent}"`;

    try {
      const { output } = await generateText({
        model: openai(agentModel),
        output: Output.object({ schema: pemAgentOutputSchema }),
        system: SYSTEM,
        prompt,
        providerOptions: { openai: { strictJsonSchema: false } },
      });

      if (!output) {
        return {
          response_text: "Got it. I'll keep that in mind.",
          creates: [],
          updates: [],
          completions: [],
          calendar_writes: [],
          memory_writes: [],
          polished_text: null,
        };
      }

      return output;
    } catch (e) {
      this.log.error(
        `PemAgent failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      throw e;
    }
  }
}
