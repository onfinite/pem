import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';

const nullStr = z.string().nullish().transform((v) => v ?? null);
const toneEnum = z
  .enum(['confident', 'tentative', 'idea', 'someday'])
  .catch('confident');
const urgencyEnum = z
  .enum(['today', 'this_week', 'someday', 'none'])
  .catch('none');
const batchEnum = z
  .enum(['shopping', 'errands', 'follow_ups'])
  .nullish()
  .transform((v) => v ?? null);

const extractActionSchema = z.object({
  text: z.string().min(1).describe('Clean, concise task text'),
  original_text: z.string().default('').describe('Raw fragment from the message'),
  tone: toneEnum,
  urgency: urgencyEnum,
  batch_key: batchEnum,
  due_at: nullStr.describe('ISO datetime if detected'),
  period_start: nullStr,
  period_end: nullStr,
  period_label: nullStr,
  pem_note: nullStr.describe('Brief context note from Pem'),
  draft_text: nullStr.describe('Draft message if follow_ups batch'),
});

const updateActionSchema = z.object({
  extract_id: z.string().describe('ID of existing extract to update'),
  patch: z.object({
    text: z.string().optional(),
    tone: toneEnum.optional(),
    urgency: urgencyEnum.optional(),
    batch_key: batchEnum.optional(),
    due_at: nullStr.optional(),
    period_start: nullStr.optional(),
    period_end: nullStr.optional(),
    period_label: nullStr.optional(),
    pem_note: nullStr.optional(),
    draft_text: nullStr.optional(),
    event_start_at: nullStr.optional().describe('New event start ISO datetime if rescheduling'),
    event_end_at: nullStr.optional().describe('New event end ISO datetime if rescheduling'),
  }),
  reason: z.string().default(''),
});

const completeActionSchema = z.object({
  extract_id: z.string(),
  command: z.enum(['mark_done', 'dismiss', 'snooze']).catch('mark_done'),
  snooze_until_iso: nullStr.optional(),
  reason: z.string().default(''),
});

const calendarWriteSchema = z.object({
  summary: z.string().min(1),
  start_at: z.string().describe('ISO datetime'),
  end_at: z.string().describe('ISO datetime'),
  location: nullStr.optional(),
  description: nullStr.optional(),
  linked_new_item_index: z.number().nullish().transform((v) => v ?? null),
});

const calendarUpdateSchema = z.object({
  extract_id: z.string().describe('ID of the extract linked to the calendar event to update'),
  summary: z.string().optional(),
  start_at: z.string().optional().describe('New ISO start datetime'),
  end_at: z.string().optional().describe('New ISO end datetime'),
  location: nullStr.optional(),
  description: nullStr.optional(),
});

const calendarDeleteSchema = z.object({
  extract_id: z.string().describe('ID of the extract linked to the calendar event to delete'),
  reason: z.string().default(''),
});

const memoryWriteSchema = z.object({
  memory_key: z.string().default('general'),
  note: z.string().min(1),
});

export const pemAgentOutputSchema = z.object({
  response_text: z.string().min(1).describe(
    "Pem's conversational response to the user. Natural, warm, concise. No markdown.",
  ),
  creates: z.array(extractActionSchema).default([]),
  updates: z.array(updateActionSchema).default([]),
  completions: z.array(completeActionSchema).default([]),
  calendar_writes: z.array(calendarWriteSchema).default([]),
  memory_writes: z.array(memoryWriteSchema).default([]),
  calendar_updates: z.array(calendarUpdateSchema).default([]),
  calendar_deletes: z.array(calendarDeleteSchema).default([]),
  summary_update: z.string().nullish().transform((v) => v ?? null).describe(
    'If the user revealed important life context (goals, relationships, preferences, worries, life situation) that should update their profile summary, provide the FULL updated summary here. Keep under 500 tokens. Only update when genuinely new info is shared.',
  ),
  polished_text: nullStr.describe(
    'Cleaned up version of the user message for the thought log',
  ),
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

CRITICAL — Meetings and calendar events:
- EVERY meeting or appointment MUST also be created as a task in "creates" with due_at set.
- When you write to calendar_writes, ALWAYS also create a matching entry in creates AND set linked_new_item_index on the calendar write to the index of that new task.
- Example: "Meet Hasib at 10:45 AM tomorrow" → creates: [{text: "Meet Hasib", due_at: "...", ...}] AND calendar_writes: [{summary: "Meet Hasib", start_at: "...", linked_new_item_index: 0}].
- This way the meeting shows up both in the calendar AND as a visible task.

Rules for your response:
- Keep it conversational. 1-4 sentences usually.
- Summarize what you did: "Got it — added milk to your shopping list and scheduled the dentist for Thursday at 2pm."
- If nothing actionable was found, just acknowledge warmly.
- If the user is journaling or venting, acknowledge their feelings. Don't try to extract tasks from emotional content unless there's a clear action item.
- NEVER use markdown, bold, asterisks, or bullet lists. Plain text only.

Context handling:
- You receive the user's open tasks, calendar events, and memory facts.
- Use this context to avoid duplicates, to mark things done when mentioned, and to make connections.
- If the user's timezone is known, interpret relative dates accordingly.
- Use the user's first name occasionally when natural — never every message.

Rules for calendar management:
- When the user asks to reschedule/move a calendar event, use calendar_updates with the extract_id that has the event.
- When the user asks to cancel/remove a calendar event, use calendar_deletes with the extract_id.
- Updating extract times via "updates" does NOT move the Google Calendar event. Always use calendar_updates for that.
- "this weekend" means Saturday AND Sunday (period_start=Saturday, period_end=Sunday).
- "next week" starts Monday.

Rules for summary_update:
- Only propose a summary_update when the user shares genuinely new life context: goals, family, relationships, preferences, worries, habits, life situation.
- Include ALL existing facts plus the new info in the update (it replaces the old summary).
- Do NOT update the summary for routine task dumps or questions.`;

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
    userName: string | null;
    userSummary: string | null;
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

    const summaryBlock = params.userSummary
      ? `## About the user\n${params.userSummary}`
      : '## About the user\n(No summary yet — learn about them from conversation)';

    const nameNote = params.userName ? `\nThe user's name is ${params.userName}.` : '';

    const prompt = `${summaryBlock}${nameNote}

Current time: ${now.toISOString()} (user timezone: ${tzLabel})

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

    const fallback: PemAgentOutput = {
      response_text: "Got it. I'll keep that in mind.",
      creates: [],
      updates: [],
      completions: [],
      calendar_writes: [],
      memory_writes: [],
      calendar_updates: [],
      calendar_deletes: [],
      summary_update: null,
      polished_text: null,
    };

    try {
      const { output } = await generateText({
        model: openai(agentModel),
        output: Output.object({ schema: pemAgentOutputSchema }),
        system: SYSTEM,
        prompt,
        maxRetries: 2,
        providerOptions: { openai: { strictJsonSchema: false } },
      });

      return output ?? fallback;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`PemAgent failed: ${msg}`);
      // On schema mismatch, return a safe fallback instead of crashing the pipeline
      if (msg.includes('did not match schema') || msg.includes('parse')) {
        return fallback;
      }
      throw e;
    }
  }
}
