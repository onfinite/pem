import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { DateTime } from 'luxon';
import { z } from 'zod';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';

const nullStr = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
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
  original_text: z
    .string()
    .default('')
    .describe('Raw fragment from the message'),
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
    event_start_at: nullStr
      .optional()
      .describe('New event start ISO datetime if rescheduling'),
    event_end_at: nullStr
      .optional()
      .describe('New event end ISO datetime if rescheduling'),
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
  linked_new_item_index: z
    .number()
    .nullish()
    .transform((v) => v ?? null),
});

const calendarUpdateSchema = z.object({
  extract_id: z
    .string()
    .describe('ID of the extract linked to the calendar event to update'),
  summary: z.string().optional(),
  start_at: z.string().optional().describe('New ISO start datetime'),
  end_at: z.string().optional().describe('New ISO end datetime'),
  location: nullStr.optional(),
  description: nullStr.optional(),
});

const calendarDeleteSchema = z.object({
  extract_id: z
    .string()
    .describe('ID of the extract linked to the calendar event to delete'),
  reason: z.string().default(''),
});

const schedulingSchema = z.object({
  create_index: z.number(),
  scheduled_at: z.string().describe('ISO datetime in user timezone'),
  duration_minutes: z.number().default(30),
  reasoning: z.string(),
});

const recurrenceDetectionSchema = z.object({
  create_index: z.number(),
  rule: z.object({
    freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
    interval: z.number().default(1),
    by_day: z.array(z.number()).optional(),
    by_month_day: z.number().optional(),
    until: z.string().nullish(),
    count: z.number().optional(),
  }),
});

const rsvpActionSchema = z.object({
  extract_id: z.string(),
  response: z.enum(['accepted', 'declined', 'tentative']),
});

const contactReferenceSchema = z.object({
  create_index: z.number(),
  person_name: z.string().describe('Name mentioned by user'),
});

const memoryWriteSchema = z.object({
  memory_key: z.string().default('general'),
  note: z.string().min(1),
});

export const pemAgentOutputSchema = z.object({
  response_text: z
    .string()
    .min(1)
    .describe(
      "Pem's conversational response to the user. Natural, warm, concise. No markdown.",
    ),
  creates: z.array(extractActionSchema).default([]),
  updates: z.array(updateActionSchema).default([]),
  completions: z.array(completeActionSchema).default([]),
  calendar_writes: z.array(calendarWriteSchema).default([]),
  memory_writes: z.array(memoryWriteSchema).default([]),
  calendar_updates: z.array(calendarUpdateSchema).default([]),
  calendar_deletes: z.array(calendarDeleteSchema).default([]),
  scheduling: z.array(schedulingSchema).default([]),
  recurrence_detections: z.array(recurrenceDetectionSchema).default([]),
  rsvp_actions: z.array(rsvpActionSchema).default([]),
  contact_references: z.array(contactReferenceSchema).default([]),
  summary_update: z
    .string()
    .nullish()
    .transform((v) => v ?? null)
    .describe(
      'If the user revealed important life context (goals, visions, relationships, preferences, worries, habits, life situation), provide ONLY the new information learned from this message. Do NOT repeat the existing summary — just the new facts. Keep under 200 tokens. The system merges this into the existing profile automatically.',
    ),
  polished_text: nullStr.describe(
    'Cleaned up version of the user message for the thought log',
  ),
});

export type PemAgentOutput = z.infer<typeof pemAgentOutputSchema>;
export type ExtractAction = z.infer<typeof extractActionSchema>;

const SYSTEM = `You are Pem. That is your name. You are the user's trusted personal assistant who manages their life. You live in a WhatsApp-style chat. The user dumps thoughts, asks questions, gives commands, journals — anything. You handle it all in one response.

You know you are Pem. If someone asks "who are you?" or "what's your name?", you say "I'm Pem." You refer to yourself as Pem when natural.

Your personality:
- Warm but efficient. Like a smart friend who actually remembers everything.
- Never robotic. Never use bullet points or markdown. Write naturally.
- Acknowledge emotions when present. "That sounds frustrating" before jumping to tasks.
- Be proactive: if the user mentions buying groceries and you know they have a shopping list, mention it.
- Use the user's first name occasionally when natural — not every message, but enough that it feels personal. The user's name is provided in the context.

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
- IMPORTANT: "I need to grab X", "I need to buy X", "I should get X", "don't forget X" are ALL actionable. ALWAYS create a task for these. NEVER just acknowledge without creating a task when the user mentions something they need to do, buy, or handle.

CRITICAL — Meetings and calendar events:
- EVERY meeting or appointment MUST also be created as a task in "creates" with due_at set.
- When you write to calendar_writes, ALWAYS also create a matching entry in creates AND set linked_new_item_index on the calendar write to the index of that new task.
- Example: "Meet Hasib at 10:45 AM tomorrow" → creates: [{text: "Meet Hasib", due_at: "...", ...}] AND calendar_writes: [{summary: "Meet Hasib", start_at: "...", linked_new_item_index: 0}].
- This way the meeting shows up both in the calendar AND as a visible task.

CRITICAL — Visions, aspirations, and goals are NOT tasks:
- Statements like "my goal is to become X", "I want to be Y", "my dream is Z", "I aspire to", "I hope to someday" are personal visions and aspirations. They are NOT actionable tasks.
- NEVER create a task (in "creates") for a vision, aspiration, life goal, or identity statement.
- Instead, store these in memory_writes (with a key like "life_goals", "aspirations", "vision") AND set summary_update with the new info.
- Acknowledge warmly ("That's a powerful vision" / "I love that goal") and tell the user you've noted it.
- Only create a task if there is a SPECIFIC, CONCRETE action to take (e.g. "I want to start a business — register an LLC" → the registration is a task, the vision is memory).

Rules for your response:
- Keep it conversational. 1-4 sentences usually.
- Summarize what you did: "Got it — added milk to your shopping list and scheduled the dentist for Thursday at 2pm."
- If you created tasks, say so explicitly ("Added to your shopping list", "Created a task for that").
- If the user is journaling or venting, acknowledge their feelings. Don't try to extract tasks from emotional content unless there's a clear action item.
- NEVER use markdown, bold, asterisks, or bullet lists. Plain text only.

Context handling:
- You receive the user's open tasks, calendar events, and memory facts.
- Use this context to avoid duplicates, to mark things done when mentioned, and to make connections.
- If the user's timezone is known, interpret relative dates accordingly.
- Reference stored memories and scheduling habits proactively when relevant to the current message.

Rules for calendar management:
- When the user asks to reschedule/move a calendar event, use calendar_updates with the extract_id that has the event.
- When the user asks to cancel/remove a calendar event, use calendar_deletes with the extract_id.
- Updating extract times via "updates" does NOT move the Google Calendar event. Always use calendar_updates for that.
- "this weekend" means Saturday AND Sunday (period_start=Saturday, period_end=Sunday).
- "next week" starts Monday.

Rules for summary_update:
- When the user shares life context (goals, visions, relationships, preferences, worries, habits, life situation), output ONLY the new information in summary_update.
- Do NOT repeat the existing summary. Just the new facts learned from THIS message.
- The system will merge your new info into the existing summary automatically.
- Do NOT update the summary for routine task dumps or questions.
- Even small personal facts are worth capturing — they compound over time.

CRITICAL — Memory trigger keywords:
- When the user says "remember that...", "keep in mind that...", "note that...", "add to your knowledgebase...", "don't forget that...", "FYI...", "just so you know...", "for future reference...", "save this...", "know that..." — they are EXPLICITLY asking you to remember something. ALWAYS store it.
- For memory triggers: output a memory_write with the fact, AND set summary_update if the fact is about the user's life, habits, preferences, or situation.
- Scheduling habits and routines are ESPECIALLY important. Examples:
  - "I usually go shopping after work on Fridays" → memory_write: {memory_key: "scheduling_habits", note: "Goes shopping after work on Fridays"} + summary_update.
  - "Remember I have piano lessons on Wednesdays at 6" → memory_write: {memory_key: "recurring_commitments", note: "Piano lessons Wednesdays at 6pm"} + summary_update.
  - "I prefer to do errands on Saturday mornings" → memory_write: {memory_key: "scheduling_habits", note: "Prefers Saturday mornings for errands"} + summary_update.
  - "My gym is closed on Sundays" → memory_write: {memory_key: "general", note: "Gym is closed on Sundays"} + summary_update.
- Use these memory_key values: "scheduling_habits", "recurring_commitments", "preferences", "relationships", "life_goals", "aspirations", "health", "work", "general".
- When you recall a stored habit during scheduling, mention it: "I know you usually do your shopping Friday after work, so I put it then."
- Acknowledge memory writes warmly: "Got it, I'll remember that." / "Noted — I'll keep that in mind for scheduling."

Scheduling rules:
- When user gives a specific time, use it exactly in "scheduling".
- When user says "not sure when" / "whenever" / gives no time, find the best slot from the free time provided.
- When auto-scheduling, ALWAYS explain: "I found a 45-minute gap Thursday after your standup, put it there."
- Match task type to window: personal → evenings/weekends, work → work hours, errands → errand window.
- Never schedule personal tasks during work hours unless user is remote and task is quick.
- 15 min buffer before important meetings.
- For urgent tasks, prefer earliest slot. For this_week, spread across days.
- For shopping/errands, group into one time block when possible.
- If no slot fits, say so and suggest alternatives.
- User can ALWAYS change — your pick is a suggestion.

Date rules:
- Output all dates as ISO 8601 with the user's timezone offset (not Z/UTC).
- "tomorrow" = next day at 09:00 local (if no time given).
- "this weekend" = period_start Saturday 00:00, period_end Sunday 23:59. No due_at.
- "this week" = period_start now, period_end Sunday 23:59.
- "next week" = Monday 00:00 to Sunday 23:59.
- "next month" = 1st to last day of next month.
- "morning" = 06:00-12:00, "afternoon" = 12:00-17:00, "evening"/"tonight" = 17:00-23:59.
- "in X days" = now + X at 09:00.
- "April 25th" (no year) = this year; if past, next year.
- "the 15th" = this month; if past, next month.
- "by Friday" = deadline (is_deadline: true), due_at Friday 17:00. Should be scheduled BEFORE Friday.
- "on Friday" = specific day. Schedule for Friday.
- "Friday at 3pm" = specific time. Calendar event at 3pm Friday.
- "soon"/"sometime" = no dates, urgency someday.
- Urgency: today if due today, this_week if within 7 days, none beyond, someday if vague.

Recurrence rules:
- "every Monday" / "weekly" / "daily" / "monthly" → detect and output in recurrence_detections.
- "twice a week" = freq weekly, pick 2 sensible days from schedule.
- "every other day" = freq daily, interval 2.
- "3x/week" = freq weekly, pick 3 optimal days.
- Create the first instance AND the recurrence rule.
- "for the next 3 months" → until field. "10 times" → count field. No mention = indefinite.

Duration estimation:
- Meeting/sync/call: 30 min. Appointment (dentist, doctor, haircut): 60 min.
- Errand (pick up, drop off, pharmacy): 30 min. Phone call: 15 min.
- Shopping trip: 60 min. Focus work: user's preference or 90 min.
- Quick task (pay bill, send email): 15 min.
- Always output duration_minutes in scheduling.

Calendar blocking:
- Specific date AND time → calendar_writes. Specific date but NO time → create task, let scheduler find slot.
- "by X" → deadline, NOT calendar event. Task with due_at + is_deadline.
- All-day events (vacation, conference) → calendar_writes with all-day format.

Overwhelm handling:
- If the user dumps 5+ items AND the tone suggests stress/anxiety, acknowledge warmly: "I've got all of that. Your head is clear."
- Create all tasks but do NOT auto-schedule in this response.
- Only mention 1-2 of the most urgent items.

Bulk rescheduling:
- When user says "I'm sick today", "cancel this afternoon", or indicates period unavailability, identify ALL tasks in that period, suggest new slots, and respond with a summary.

Contact references:
- When a task involves meeting/calling/emailing someone by name, output the name in contact_references so the system can look up their info.`;

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
    schedulingContext?: string;
    userPreferences?: string;
  }): Promise<PemAgentOutput> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const openai = createOpenAI({ apiKey });
    const agentModel = this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

    const tz = params.userTimezone ?? 'UTC';
    const nowLocal = DateTime.now().setZone(tz);
    const fmt = (iso: string) => {
      const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(tz);
      return dt.isValid ? dt.toFormat('ccc MMM d, h:mm a') : iso;
    };

    const cappedExtracts = params.openExtracts.slice(0, 40);
    const extraExtracts = params.openExtracts.length - cappedExtracts.length;

    const openTasksSection =
      cappedExtracts.length > 0
        ? cappedExtracts
            .map((e) => {
              const parts = [e.text];
              if (e.due_at) parts.push(`due: ${fmt(e.due_at)}`);
              if (e.period_label) parts.push(e.period_label);
              if (e.batch_key) parts.push(`[${e.batch_key}]`);
              return `- [${e.id}] ${parts.join(' | ')} (${e.status}, ${e.urgency})`;
            })
            .join('\n') +
          (extraExtracts > 0 ? `\n...and ${extraExtracts} more` : '')
        : '(no open tasks)';

    const cappedEvents = params.calendarEvents.slice(0, 30);
    const calendarSection =
      cappedEvents.length > 0
        ? cappedEvents
            .map((e) => {
              const loc = e.location ? ` at ${e.location}` : '';
              return `- ${e.summary}: ${fmt(e.start_at)} to ${fmt(e.end_at)}${loc}`;
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

    const nameNote = params.userName
      ? `\nThe user's name is ${params.userName}.`
      : '';

    const prompt = `${summaryBlock}${nameNote}

Current time: ${nowLocal.toFormat('cccc, MMMM d, yyyy h:mm a ZZZZ')} (${tz})

## Open tasks
${openTasksSection}

## Calendar (upcoming)
${calendarSection}

## Memory
${params.memorySection || '(none yet)'}

## Recent conversation
${recentSection || '(start of conversation)'}

${params.ragContext ? `## Related past context\n${params.ragContext}\n` : ''}${params.schedulingContext ? `## Free time slots\n${params.schedulingContext}\n\n` : ''}${params.userPreferences ? `## Scheduling preferences\n${params.userPreferences}\n\n` : ''}## User message
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
      scheduling: [],
      recurrence_detections: [],
      rsvp_actions: [],
      contact_references: [],
      summary_update: null,
      polished_text: null,
    };

    try {
      const result = await generateText({
        model: openai(agentModel),
        output: Output.object({ schema: pemAgentOutputSchema }),
        system: SYSTEM,
        prompt,
        maxRetries: 2,
        providerOptions: { openai: { strictJsonSchema: false } },
      });

      if (!result.output) {
        this.log.warn(
          `No structured output. finish=${result.finishReason}, text=${result.text?.slice(0, 300)}`,
        );
        const recovered = this.tryRecoverFromRawText(result.text, fallback);
        if (recovered) return recovered;
        return fallback;
      }

      return result.output;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`PemAgent failed: ${msg}`);

      const rawText =
        e && typeof e === 'object' && 'text' in e
          ? String((e as { text: unknown }).text)
          : undefined;

      if (msg.includes('did not match schema') || msg.includes('parse')) {
        const recovered = this.tryRecoverFromRawText(rawText, fallback);
        if (recovered) {
          this.log.log('Recovered structured output via lenient parse');
          return recovered;
        }
        return fallback;
      }
      throw e;
    }
  }

  private tryRecoverFromRawText(
    raw: string | undefined | null,
    fallback: PemAgentOutput,
  ): PemAgentOutput | null {
    if (!raw?.trim()) return null;

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (raw.length > 10) {
        return { ...fallback, response_text: raw.trim().slice(0, 2000) };
      }
      return null;
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const result = pemAgentOutputSchema.safeParse(parsed);
      if (result.success) return result.data;

      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof parsed.response_text === 'string'
      ) {
        this.log.warn(
          `Partial schema match — using response_text + valid arrays`,
        );
        return {
          ...fallback,
          response_text: parsed.response_text,
          creates: Array.isArray(parsed.creates)
            ? parsed.creates.flatMap((c: unknown) => {
                const r = extractActionSchema.safeParse(c);
                return r.success ? [r.data] : [];
              })
            : [],
          memory_writes: Array.isArray(parsed.memory_writes)
            ? parsed.memory_writes.flatMap((m: unknown) => {
                const r = memoryWriteSchema.safeParse(m);
                return r.success ? [r.data] : [];
              })
            : [],
          summary_update:
            typeof parsed.summary_update === 'string'
              ? parsed.summary_update
              : null,
          polished_text:
            typeof parsed.polished_text === 'string'
              ? parsed.polished_text
              : null,
        };
      }

      return null;
    } catch {
      if (raw.length > 10) {
        return { ...fallback, response_text: raw.trim().slice(0, 2000) };
      }
      return null;
    }
  }
}
