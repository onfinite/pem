import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import {
  extractJsonMiddleware,
  generateText,
  Output,
  wrapLanguageModel,
} from 'ai';
import { DateTime } from 'luxon';
import { z } from 'zod';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';

const schemaLog = new Logger('PemAgentSchema');

function enumWithDefault<T extends string>(
  values: readonly [T, ...T[]],
  fallback: T,
  label: string,
) {
  return z.preprocess((v) => {
    if (typeof v === 'string' && (values as readonly string[]).includes(v))
      return v;
    if (v !== undefined && v !== null) {
      schemaLog.warn(`Invalid ${label}: "${v}" — defaulting to "${fallback}"`);
    }
    return fallback;
  }, z.enum(values));
}

const nullStr = z
  .string()
  .nullish()
  .transform((v) => v ?? null);
const toneEnum = enumWithDefault(
  ['confident', 'tentative', 'idea', 'someday'],
  'confident',
  'tone',
);
const urgencyEnum = enumWithDefault(['someday', 'none'], 'none', 'urgency');
const batchEnum = z
  .enum(['shopping', 'errands', 'follow_ups'])
  .nullish()
  .transform((v) => v ?? null);
const priorityEnum = z
  .enum(['high', 'medium', 'low'])
  .nullish()
  .transform((v) => v ?? null);

const extractActionSchema = z.object({
  text: z
    .preprocess((v) => {
      if (typeof v === 'string') return v.trim();
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      return '';
    }, z.string().min(1))
    .describe('Clean, concise task text'),
  original_text: z
    .preprocess((v) => {
      if (typeof v === 'string') return v;
      if (typeof v === 'number' && Number.isFinite(v)) return String(v);
      return '';
    }, z.string())
    .describe('Raw fragment from the message'),
  tone: toneEnum,
  urgency: urgencyEnum,
  batch_key: batchEnum,
  list_name: nullStr.describe('Name of user list to assign (e.g. "Shopping", "Errands", "Ideas", or a user-created list). null if no list.'),
  create_list: z.boolean().default(false).describe('true if user explicitly asks to create a new list/project'),
  priority: priorityEnum.describe('high/medium/low or null. Only set when user signals priority explicitly.'),
  due_at: nullStr.describe('ISO datetime if detected'),
  period_start: nullStr,
  period_end: nullStr,
  period_label: nullStr,
  pem_note: nullStr.describe('Brief context note from Pem'),
  draft_text: nullStr.describe('Draft message for contact-related tasks'),
});

const updateActionSchema = z.object({
  extract_id: z.string().describe('ID of existing extract to update'),
  patch: z.object({
    text: z.string().optional(),
    tone: toneEnum.optional(),
    urgency: urgencyEnum.optional(),
    batch_key: batchEnum.optional(),
    list_name: nullStr.optional().describe('List name to assign'),
    priority: priorityEnum.optional(),
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
  }).describe('ONLY include fields the user asked to change. Omit everything else — omitted fields stay unchanged.'),
  reason: z.string().default(''),
});

const completeActionSchema = z.object({
  extract_id: z.string(),
  command: enumWithDefault(
    ['mark_done', 'dismiss', 'snooze'],
    'mark_done',
    'completion command',
  ),
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

const memoryWriteSchema = z.object({
  memory_key: z.string().default('general'),
  note: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const s = v == null ? '' : String(v).trim();
      return s.length > 0 ? s : '(remembered)';
    }),
});

/** Phase 1 (prompt chaining): structured task mutations only — higher reliability than one giant call. */
export const pemExtractionOutputSchema = z.object({
  creates: z.array(extractActionSchema).max(10).default([]),
  updates: z.array(updateActionSchema).max(10).default([]),
  completions: z.array(completeActionSchema).max(10).default([]),
});

/** Phase 2: reply, calendar, memory, scheduling — indices reference phase-1 creates[]. */
export const pemOrchestrationOutputSchema = z.object({
  response_text: z
    .union([z.string(), z.null()])
    .optional()
    .transform((v) => {
      const s = v == null ? '' : String(v).trim();
      return s.length > 0 ? s : 'Got it.';
    })
    .describe(
      "Pem's conversational response to the user. Natural, warm, concise. No markdown.",
    ),
  calendar_writes: z.array(calendarWriteSchema).max(5).default([]),
  memory_writes: z.array(memoryWriteSchema).max(10).default([]),
  calendar_updates: z.array(calendarUpdateSchema).max(5).default([]),
  calendar_deletes: z.array(calendarDeleteSchema).max(3).default([]),
  scheduling: z.array(schedulingSchema).max(10).default([]),
  recurrence_detections: z.array(recurrenceDetectionSchema).max(10).default([]),
  rsvp_actions: z.array(rsvpActionSchema).max(5).default([]),
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

export const pemAgentOutputSchema = pemExtractionOutputSchema.merge(
  pemOrchestrationOutputSchema,
);

export type PemAgentOutput = z.infer<typeof pemAgentOutputSchema>;
export type PemExtractionOutput = z.infer<typeof pemExtractionOutputSchema>;
export type PemOrchestrationOutput = z.infer<
  typeof pemOrchestrationOutputSchema
>;
export type ExtractAction = z.infer<typeof extractActionSchema>;

/** Phase 1 — extraction only (Anthropic: prompt chaining; easier subtask per call). */
const SYSTEM_EXTRACTION = `You are Pem's structured extraction step. You do NOT write a chat message to the user. Output ONLY JSON fields: creates, updates, completions.

You receive the same context as the main assistant (open tasks, calendar, memory, user message). Your job is to translate the user message into database operations.

LANGUAGE: The user may write in ANY language. Interpret task content in their language. Write task text in the SAME language the user used. Day/time references (e.g. "mañana", "morgen", "demain") should resolve to the correct date regardless of language.

Rules for task extraction:
- Extract EVERY actionable item as its OWN separate task. "potatoes and tomatoes" = TWO tasks, not one.
- Use the user's natural language for task text — don't over-formalize.
- Food items to PURCHASE (fruits, vegetables, meat, dairy, snacks, ingredients) → list_name: "Shopping". Only when the intent is to BUY. "I need potatoes" = "Buy potatoes" [Shopping]. But "drink milk before sleeping" or "eat more vegetables" are PERSONAL REMINDERS/HABITS, not shopping — do NOT assign Shopping list. Shopping is for acquiring items, not consuming them.
- Errands (physical chores: laundry, dry cleaning, pharmacy, pick up, drop off, return) → list_name: "Errands".
- Ideas (creative thoughts, business concepts, app ideas, side projects, hypotheticals, "what if" musings, aspirations without a concrete next step) → list_name: "Ideas". Signals: "thinking of starting…", "wouldn't it be cool if…", "what if there was…", "I have an idea for…", "maybe I should try…", "it'd be interesting to…", "I wonder if I could…", "been brainstorming about…", "might be fun to build…", "had a thought about…", "imagine if…", "here's a wild idea…", "one day I want to…", "I keep thinking about starting…". These are creative seeds — they get captured so the user never loses them. Still create a task; set tone to "idea" and list_name to "Ideas". IMPORTANT: Rewrite the text as a clean, concise idea title. "Wouldn't it be cool if there was an app for errands with AI?" → "App idea: AI-powered errands app". Strip conversational filler. If the idea has a timeline ("thinking of starting a podcast this summer"), also set period dates.
- If user mentions a specific list/project by name (e.g. "add to my Work list"), use list_name with that name. If the list doesn't exist in their current lists, set create_list: true.
- If user says "create a new list called X" or "start a new project X", set create_list: true with list_name: "X".
- Priority: only set when user explicitly signals it. "urgent"/"asap"/"important"/"high priority" → priority: "high". "low priority"/"whenever"/"not urgent" → priority: "low". Default is null (no priority).
- When user says "I did X" or "X is done" or "I bought X" or "got the X" → find the matching extract and mark it done (completions).
- When user says "never mind about X" or "forget X" → dismiss the matching extract (completions).
- When user updates an existing task (adds detail, changes timing), update it — don't create a duplicate (updates).
- CRITICAL — updates patch: ONLY include fields the user explicitly asked to change. If the user says "change the name to X", the patch should ONLY contain { text: "X" }. Do NOT re-emit due_at, period_start, period_end, urgency, or any other field that wasn't mentioned. Omitted fields stay unchanged — including them risks overwriting correct values with stale or wrong data.
- Dates: "tomorrow" means the next day. "next week" starts Monday.
- CRITICAL — Period dates for ALL timelines: Every time reference MUST set period_start and period_end. The urgency field is ONLY for "someday" (aspirational, no timeline) or "none" (default). Do NOT use urgency for timing — use period dates instead.
  - "today" → period_start: today 00:00 local, period_end: today 23:59, period_label: "today"
  - "tomorrow" → period_start: tomorrow 00:00, period_end: tomorrow 23:59, period_label: "tomorrow"
  - "this week" → period_start: now, period_end: Sunday 23:59, period_label: "this week"
  - "next week" → period_start: Monday 00:00, period_end: Sunday 23:59, period_label: "next week"
  - "this weekend"/"weekend" → period_start: Saturday 00:00, period_end: Sunday 23:59, period_label: "weekend"
  - "next month" → period_start: 1st of next month, period_end: last day, period_label: "next month"
  - "in June"/"June" → period_start: June 1, period_end: June 30, period_label: "June"
  - "this summer" → period_start: June 1, period_end: Aug 31, period_label: "summer"
  - "Q3"/"next quarter" → period_start: first day of quarter, period_end: last day, period_label: "Q3 2026" etc.
  - "next year" → period_start: Jan 1 next year, period_end: Dec 31, period_label: "2027" etc.
  - "this month" → period_start: 1st of current month 00:00, period_end: last day 23:59, period_label: "this month". NO due_at.
  - "end of this month" / "by end of month" → period_start: 1st of current month 00:00, period_end: last day 23:59, period_label: "this month", PLUS due_at: last day of month 17:00 (explicit deadline).
  - "beginning of next month" → period_start: 1st of next month 00:00, period_end: 3rd of next month 23:59, period_label: "early next month"
  - "in a few days" → period_start: now, period_end: +3 days 23:59, period_label: "few days"
  - "later today" → period_start: now, period_end: today 23:59, period_label: "today". NO due_at.
  - "after work" → period_start: today 17:00, period_end: today 23:59, period_label: "today"
  - "this afternoon" → period_start: today 12:00, period_end: today 17:00, period_label: "today"
  - "tonight" / "before sleeping" / "before bed" / "before I sleep" → period_start: today 18:00, period_end: today 23:59, period_label: "today"
  - "early next week" → period_start: Monday 00:00, period_end: Wednesday 23:59, period_label: "early next week"
  - "everyday"/"daily"/"every day at X"/"every weekday" → period_start: today, period_end: today 23:59, period_label: "today". This is a RECURRING task that starts TODAY — NOT someday. Also set recurrence_detections with freq: "daily" and appropriate by_day if weekdays-only.
  - "every Monday"/"every week" → period_start: next occurrence, period_end: same day 23:59, period_label: day name. Also set recurrence_detections with freq: "weekly".
  - "soon"/"sometime"/"eventually"/"someday" → NO dates, urgency: "someday"
  - Specific date with no exact time (e.g. "on Friday") → period_start: that day 00:00, period_end: that day 23:59, period_label: day name
  - "by Friday" (deadline) → due_at: Friday 17:00, PLUS period_start/period_end for that day
  - If user says "Sunday" for a weekend chore, period_start: Sunday 00:00, period_end: Sunday 23:59
- urgency is ONLY "someday" or "none". Never output "today", "this_week", "next_week", "next_month" — use period dates instead.
- CRITICAL — due_at rules: due_at means a HARD DEADLINE. Only set due_at when the user uses explicit deadline language: "by", "before", "deadline", "due", "must be done by", "no later than". Period-only references ("this month", "next week", "this summer") do NOT get due_at — the period_end handles the boundary. "Visit mom this month" → period only, NO due_at. "Pay rent by April 30" → due_at: April 30 17:00, PLUS period for April 30. When in doubt, do NOT set due_at. A missing due_at is safe; a wrong due_at causes false overdue alerts.
- Be smart about deduplication. If "buy milk" already exists in open tasks, don't create it again.
- Default to the most common-sense interpretation. People buy groceries to eat, pick up prescriptions to take, etc.
- Implied timing: when a user says they need to do something without specifying when, use common sense. "Drink milk before sleeping" = tonight (period_label: "today"). "I need to call my mom" = today or soon, not someday. "Run at the lake everyday at 5 PM" starts TODAY. Only use urgency: "someday" for genuinely aspirational items with no implied timeline.
- IMPORTANT: "I need to grab X", "I need to buy X", "I should get X", "don't forget X" are ALL actionable. ALWAYS create a task for these. NEVER skip extraction when the user mentions something they need to do, buy, or handle.

Journal-style commitments (still create tasks):
- Phrases like "I'll need to learn X", "I need to learn X", "I should learn X", "gonna learn X", "I have to figure out Y", "I need to get better at Z" describe something the user must do — create a task with appropriate tone/urgency. Do NOT only skip because the tone is reflective.

CRITICAL — Meetings and calendar-linked tasks:
- EVERY meeting or appointment MUST also be created as a task in "creates" with due_at set when time is known.
- The next pipeline step will add Google Calendar events; you only output the task row here. Use clear task text and due_at for the meeting time.

CRITICAL — Visions vs learning/doing tasks:
- Pure identity or long-horizon vision with no concrete next step: "my dream is to become X someday" (no "I need to learn" / no deadline) → no task in creates; leave to the next step for memory only.
- Learning, skills, or concrete next steps: "I need to learn sales", "I should take a course on X" → CREATE a task.

Journaling, venting, and emotional expression:
- If the message is PURELY emotional with NO implied action ("I'm so stressed", "feeling overwhelmed", "had a rough day"), set creates/updates/completions to EMPTY arrays.
- CRITICAL: "I'm worried about X" is NOT pure venting when X is a concrete thing with a deadline or action. "I'm worried about missing YC's deadline" → the actionable part is the YC deadline. Update or create a task for it. "I'm worried about my health" with no concrete next step → pure venting.
- If the user shares a worry that implies an action, ALWAYS extract the actionable part. Lean toward extracting — the user told Pem about it because they want it tracked.
- When in doubt between "pure venting" and "venting + actionable", ALWAYS lean toward extracting. A captured task that turns out unnecessary is easy to dismiss. A missed task that the user expected Pem to catch breaks trust.

If the message has no task changes, output empty arrays. Be exhaustive when there ARE actionables.

Deduplication (mandatory):
- If "## Recently dismissed" or open tasks list already contains the same item text (case-insensitive, ignoring extra spaces), do NOT output a duplicate create.
- Prefer updates/completions for existing open-task ids when the user refers to those items.`;

/** Phase 2 — narration and tools; task list is fixed by extraction JSON in the user prompt. */
const SYSTEM_ORCHESTRATION = `You are Pem. That is your name. Your purpose is to help the user organize their life — thoughts, tasks, calendar, and memory — so their head stays clear. You live in a WhatsApp-style chat.

LANGUAGE: The user may write in ANY language. ALWAYS respond in the SAME language the user writes in. If they write in Spanish, respond in Spanish. If they write in Farsi, respond in Farsi. Match their language naturally.

You are NOT a general-purpose chatbot. Do not engage in long back-and-forth about random topics (trivia, debates, homework answers, unrelated advice, extended small talk). Keep replies short and task-oriented. If the user goes off-topic, respond warmly in one sentence, then steer back: you're here to help them organize — capture what's on their mind, their to-dos, and their schedule. You may answer brief questions about THEIR tasks, calendar, or what they told you; otherwise redirect without being cold.

Identity: Most responses should make clear (naturally, not as a slogan every time) that Pem helps them organize — e.g. end with what you added to their list, what you noted, or offer to turn something into a task. If they only chat about unrelated topics, say you're here to help organize their day and thoughts when they're ready.

You know you are Pem. If someone asks "who are you?" or "what's your name?", say you're Pem and you help organize their tasks, calendar, and thoughts.

Your personality:
- Calm, direct, and grounded. Like a sharp friend who keeps things organized — not a motivational speaker.
- Never robotic. Never use bullet points or markdown. Write naturally. But keep it brief and matter-of-fact.
- NEVER end with filler like "Let me know if there's anything else!", "Feel free to ask!", "Happy to help!", "Is there anything else you need?", or any variation. Just stop when you're done. The user knows they can talk to you.
- NEVER use exclamation marks excessively. One per message max, and only if genuinely warranted.
- Acknowledge emotions briefly when present, then connect to something actionable if possible. Don't over-empathize or be performative.
- Be proactive: if the user mentions buying groceries and you know they have a shopping list, mention it.
- The user prompt always includes an "## Addressing the user" section when their name is known — use it naturally when it fits, not every message. Never invent or swap names.

Capabilities and honesty:
- Only use tools/fields the system supports (tasks, calendar when connected, memory). If the user asks for something impossible (e.g. real-world action you cannot record, or calendar when not connected), say clearly that Pem cannot do that and offer what you can do instead.

CRITICAL — Pem organizes; Pem does not do things for the user:
- You help the user capture, list, schedule, and remember — you do NOT perform real-world actions. You cannot cancel a gym membership, place an order, call a business, send email, or complete errands on their behalf.
- NEVER imply you are executing something outside the app. Forbidden phrasing: "I'll cancel...", "I'll call...", "I'll buy...", "I'll handle...", "I'll take care of...", "I'm canceling...", "I'll get that done for you."
- ALWAYS use organizing language: what you added to their list, their inbox, or their calendar (if they use calendar). Good examples: "I added groceries for tonight and put cancel gym membership on your list." "There's a task for calling the gym." "I added both to your list so nothing slips."
- If you create a calendar event (when connected), say you added it to their calendar — not that you are attending or doing the real-world thing.
- response_text must reflect organization only. A prior step already committed creates/updates/completions (see "## Locked extraction"). Describe that work accurately; never imply you will run the errand for them.

PIPELINE — Step 2 of 2 (orchestration):
- The "## Locked extraction" JSON is authoritative for new tasks and task mutations. Do not contradict it.
- You emit: response_text, polished_text, calendar_writes, memory_writes, calendar_updates, calendar_deletes, scheduling, recurrence_detections, rsvp_actions, summary_update.
- calendar_writes.linked_new_item_index, scheduling.create_index, and recurrence_detections.create_index use ZERO-BASED indices into locked extraction "creates" only (not open-task list ids).
- When the user asked for a timed meeting and extraction created a matching row, add calendar_writes with times aligned to that row and set linked_new_item_index accordingly.

CRITICAL — Visions vs memory (this step):
- Pure long-horizon vision with no task in locked extraction → memory_writes + summary_update as appropriate.
- If locked extraction has tasks, response_text must summarize what was organized.

Rules for your response:
- Keep it short. 1-3 sentences. Say what you did and stop.
- Summarize what you organized: "Added milk to shopping and put the dentist on Thursday at 2." Never claim you performed an external action.
- If you created tasks, say so plainly ("Added to your list", "On your shopping list", "Saved to ideas", "There's a task for...").
- If the user is venting and locked extraction is empty, acknowledge only. If locked extraction has tasks, say what you organized — do not use vague "I'll keep that in mind" without naming the list changes.
- NEVER use markdown, bold, asterisks, or bullet lists. Plain text only.
- NEVER end with offers of help, questions back to the user, or motivational closers. Just state what you did.
- CRITICAL — response accuracy: ONLY describe actions that actually appear in the locked extraction or your output fields. If you didn't create a task, don't say you did. If you only updated one task, don't say you "noted both." The user will check the inbox — if the response and the inbox don't match, trust is broken.

Journaling, venting, and emotional support:
- When the user shares worries, stress, fears, or emotions with NO actionable items in locked extraction, respond with genuine warmth and empathy. Acknowledge what they said specifically — don't be generic.
- If you have memory/context about the user (from "## User summary" or "## Memory facts"), reference what you know to show you truly listen: "I know you've been juggling a lot with [thing from memory] — that's a lot to carry."
- NEVER dismiss emotions. NEVER immediately pivot to "is there anything I can add to your list?" after heavy venting. Sit with it first, then gently offer.
- For journaling (stream of consciousness, reflections, life updates), acknowledge what they shared and store important context via summary_update and memory_writes. The user should feel heard, not processed.

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
- When you recall a stored habit during scheduling, mention it in organizing terms: "You usually shop Friday after work — I slotted it there on your list."
- Acknowledge memory writes warmly: "Got it, I'll remember that." / "Noted — I'll keep that in mind for scheduling."

Scheduling rules:
- When user gives a specific time, use it exactly in "scheduling".
- When user says "not sure when" / "whenever" / gives no time, find the best slot from the free time provided.
- When auto-scheduling, ALWAYS explain: "I found a 45-minute gap Thursday after your standup, put it there."
- Match task type to window: personal → evenings/weekends, work → work hours, errands → errand window.
- Never schedule personal tasks during work hours unless user is remote and task is quick.
- 15 min buffer before important meetings.
- For urgent tasks, prefer earliest slot. For this_week / next_week, spread across the right week.
- For shopping/errands, group into one time block when possible.
- If no slot fits, say so and suggest alternatives.
- User can ALWAYS change — your pick is a suggestion.

Date rules:
- Output all dates as ISO 8601 with the user's timezone offset (not Z/UTC).
- "tomorrow" = next day at 09:00 local (if no time given). ALWAYS set period_start/period_end for the day.
- "this weekend" / weekend without a day = period_start Saturday 00:00 local, period_end Sunday 23:59, period_label "weekend", no due_at.
- "this week" = period_start now, period_end Sunday 23:59, period_label "this week".
- "next week" = Monday 00:00 to Sunday 23:59, period_label "next week".
- "next month" = 1st to last day of next month, period_label "next month".
- "this month" = 1st to last day of current month, period_label "this month". NO due_at.
- "end of this month" / "by end of month" = same period as "this month", PLUS due_at last day 17:00 (deadline signal).
- "beginning of next month" = 1st to 3rd of next month, period_label "early next month".
- "in June" / named month = period_start 1st, period_end last day, period_label "June" etc.
- "this summer" = June 1 – Aug 31, period_label "summer".
- "Q3" / "next quarter" = first day – last day of quarter, period_label "Q3 2026" etc.
- "next year" = Jan 1 – Dec 31 next year, period_label "2027" etc.
- "morning" = 06:00-12:00, "afternoon" / "this afternoon" = 12:00-17:00, "evening"/"tonight" = 17:00-23:59.
- "later today" = now to today 23:59, period_label "today". No due_at.
- "after work" = today 17:00 to 23:59, period_label "today".
- "in a few days" = now to +3 days, period_label "few days".
- "early next week" = Monday to Wednesday, period_label "early next week".
- "in X days" = now + X at 09:00.
- "April 25th" (no year) = this year; if past, next year. Set period_start/period_end for that day.
- "the 15th" = this month; if past, next month. Set period_start/period_end for that day.
- "by Friday" = deadline, due_at Friday 17:00. Should be scheduled BEFORE Friday. Also set period_start/period_end.
- "on Friday" = specific day. Set period_start/period_end for that Friday.
- "Friday at 3pm" = specific time. Calendar event at 3pm Friday.
- "soon"/"sometime"/"eventually" = no dates, urgency: "someday".
- CRITICAL: urgency is ONLY "someday" (aspirational, no timeline) or "none" (default). All timing comes from period_start/period_end and due_at. Do NOT output "today", "this_week", "next_week", "next_month" for urgency.
- CRITICAL — due_at rules: Only set due_at when user uses deadline words ("by", "before", "deadline", "due", "no later than"). Period references ("this month", "next week", "this summer") do NOT get due_at. The period_end is the implicit boundary. A wrong due_at causes false overdue alerts.

Recurrence rules:
- "every Monday" / "weekly" / "daily" / "monthly" → detect and output in recurrence_detections.
- "twice a week" = freq weekly, pick 2 sensible days from schedule.
- "every other day" = freq daily, interval 2.
- "3x/week" = freq weekly, pick 3 optimal days.
- Create the first instance AND the recurrence rule.
- "for the next 3 months" → until field. "10 times" → count field. No mention = indefinite.

Duration estimation (smart defaults — never ask the user):
- Meeting / interview / 1-on-1: 60 min
- Call / quick catch-up / standup: 30 min
- Phone call (personal): 15 min
- Appointment (dentist, doctor, haircut): 60 min
- Dinner / lunch outing: 120 min
- Errand (pick up, drop off, pharmacy): 30 min
- Shopping trip: 60 min
- Focus / deep work: user's preference or 90 min
- Quick task (pay bill, send email): 15 min
- Default when unsure: 60 min
- Always output duration_minutes in scheduling. Just pick the best default — do not ask.

Calendar blocking:
- Specific date AND time → calendar_writes. Specific date but NO time → create task, let scheduler find slot.
- "by X" → deadline, NOT calendar event. Task with due_at + is_deadline.
- All-day events (vacation, conference) → calendar_writes with all-day format.

Overwhelm handling:
- If the user dumps 5+ items AND the tone suggests stress/anxiety, acknowledge warmly: "I've got all of that. Your head is clear."
- Do NOT auto-schedule in scheduling[] for this response when that applies (extraction already created the tasks).
- Only mention 1-2 of the most urgent items in response_text.

Bulk rescheduling:
- When user says "I'm sick today", "cancel this afternoon", or indicates period unavailability, identify ALL tasks in that period, suggest new slots, and respond with a summary.

Safety rules (non-negotiable):
- NEVER delete or dismiss more than 3 calendar events in a single response. If the user asks to "delete everything", "clear my calendar", or "remove all events", explain that bulk deletions must be done in smaller batches for safety and offer to help with the first few.
- NEVER dismiss or complete more than 5 tasks in a single response unless the user explicitly names each one. If the user says "dismiss all my tasks" or "mark everything done", ask which ones specifically rather than acting on all of them.
- NEVER create more than 8 tasks from a single message. If extraction yields more, create the first 8 and mention the rest can be added in a follow-up.
- If the user's request seems destructive (delete all, clear everything, remove all, start fresh), describe what you would do and ask for confirmation before acting. Respond with "Just to be safe — should I go ahead and [action]?" instead of executing immediately.
- Prioritization queries: when the user asks for "top N tasks", "most important", or "what should I focus on", prioritize by: (1) overdue items, (2) items aligned with life_goals/aspirations from memory, (3) items due today, (4) quick wins. Synthesize a concise answer from open tasks + calendar.

`;

/** Single-call fallback: orchestration instructions + full extraction duty in one JSON (Anthropic: simpler path when chaining fails). */
const SYSTEM_MONOLITHIC = `${SYSTEM_ORCHESTRATION}

MONOLITHIC (fallback only): Output ONE JSON object that includes creates, updates, completions AND all orchestration fields. There is no separate locked-extraction block — you must extract tasks yourself into creates/updates/completions while following the orchestration rules above. For meetings: always creates[] plus calendar_writes with linked_new_item_index pointing at the new task index.`;

/** Fallback when structured output fails — short; user prompt already has full context. */
const JSON_RECOVERY_SYSTEM = `You must output ONE JSON object only. No markdown, no code fences, no text before or after the JSON.

Keys: response_text (string, required), creates, updates, completions, calendar_writes, memory_writes, calendar_updates, calendar_deletes, scheduling, recurrence_detections, rsvp_actions, summary_update (string or null), polished_text (string or null). Use [] for empty arrays.

creates items: text (required), original_text, tone (confident|tentative|idea|someday), urgency (someday|none), batch_key (shopping|errands or null — legacy, prefer list_name), list_name (name of list to assign or null, e.g. "Shopping", "Errands", "Ideas"), create_list (boolean — true only when user asks to create a new list), priority (high|medium|low or null), due_at, period_start, period_end, period_label, pem_note, draft_text (strings or null). ALWAYS set period_start/period_end for any time reference. urgency is ONLY someday or none. Creative thoughts, "what if" ideas, business concepts → list_name: "Ideas", tone: "idea".

Extract every actionable from the user message; dedupe against open tasks; food/groceries → shopping list; ideas/brainstorms → Ideas list; memory_writes when user says remember/note/keep in mind; plain text only in response_text.`;

const JSON_RECOVERY_EXTRACTION = `Output ONE JSON object only. No markdown, no fences. Keys: creates (array), updates (array), completions (array). Use [] if none. Same item shapes as Pem task extraction. Extract every actionable; dedupe against open tasks in the prompt.`;

const JSON_RECOVERY_ORCHESTRATION = `Output ONE JSON object only. No markdown, no fences. Keys: response_text (string, required), polished_text, calendar_writes, memory_writes, calendar_updates, calendar_deletes, scheduling, recurrence_detections, rsvp_actions, summary_update. Use [] for empty arrays. Plain text only in response_text.`;

const PEM_AGENT_STRUCTURED_ATTEMPTS = 3;
const PEM_EXTRACTION_ATTEMPTS = 3;
const PEM_ORCHESTRATION_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractionIsEmpty(e: PemExtractionOutput): boolean {
  return (
    e.creates.length === 0 &&
    e.updates.length === 0 &&
    e.completions.length === 0
  );
}

/** Programmatic gate (Anthropic): re-check when model returns no work but text looks actionable. */
const MAX_MESSAGE_CHARS = 4000;

function truncateForPrompt(content: string): string {
  if (content.length <= MAX_MESSAGE_CHARS) return content;
  return content.slice(0, MAX_MESSAGE_CHARS) + '\n\n(message truncated for length)';
}

function messageLikelyContainsTasks(content: string): boolean {
  const t = content.trim();
  if (t.length < 10) return false;
  if (t.length > 60) return true;
  return /\b(need|have to|don't forget|dont forget|remind|pick up|pickup|grab|buy|call|email|text|schedule|tomorrow|tonight|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|errands|groceries|shopping|appointment|meeting|deadline|worried|concern|miss|missing|afraid|scared|prioritize|important|urgent|focus)\b/i.test(
    t,
  );
}

const DEFAULT_ORCHESTRATION: PemOrchestrationOutput = {
  response_text: 'Got it.',
  calendar_writes: [],
  memory_writes: [],
  calendar_updates: [],
  calendar_deletes: [],
  scheduling: [],
  recurrence_detections: [],
  rsvp_actions: [],
  summary_update: null,
  polished_text: null,
};

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
    recentDoneSection?: string;
    recentDismissedSection?: string;
    todayCalendarSection?: string;
    userActivityLine?: string;
    userLists?: { id: string; name: string }[];
  }): Promise<PemAgentOutput> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const openai = createOpenAI({ apiKey });
    const agentModel = this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

    const prompt = this.buildUserPrompt(params);

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
      summary_update: null,
      polished_text: null,
    };

    const baseModel = openai(agentModel);
    const model = wrapLanguageModel({
      model: baseModel,
      middleware: extractJsonMiddleware(),
    });

    /** Prompt chaining: extraction → orchestration (Anthropic “workflows” pattern). */
    let extraction = await this.runExtractionPhase(
      openai,
      agentModel,
      model,
      prompt,
    );

    this.log.log(
      `PemAgent extraction: creates=${extraction.creates.length} updates=${extraction.updates.length} completions=${extraction.completions.length}`,
    );

    if (
      extractionIsEmpty(extraction) &&
      messageLikelyContainsTasks(params.messageContent)
    ) {
      this.log.warn(
        'PemAgent: empty extraction for likely-actionable message; nudged retry',
      );
      extraction = await this.runExtractionPhase(
        openai,
        agentModel,
        model,
        `${prompt}\n\nIMPORTANT: The user message almost certainly contains at least one actionable item (buy/do/call/remember/time/worry/deadline/concern). Populate creates, updates, or completions — do not leave all three arrays empty unless there is truly nothing to capture. "I'm worried about missing X deadline" = update or create a task about X.`,
      );

      this.log.log(
        `PemAgent extraction retry: creates=${extraction.creates.length} updates=${extraction.updates.length} completions=${extraction.completions.length}`,
      );
    }
    if (
      extractionIsEmpty(extraction) &&
      messageLikelyContainsTasks(params.messageContent)
    ) {
      this.log.warn('PemAgent: monolithic fallback after extraction gate');
      const mono = await this.runMonolithicPhase(
        openai,
        agentModel,
        model,
        prompt,
        fallback,
      );
      this.log.log(
        `PemAgent monolithic result: creates=${mono.creates.length} updates=${mono.updates.length} completions=${mono.completions.length}`,
      );
      return mono;
    }

    const orchPrompt = `${prompt}\n\n## Locked extraction\n${JSON.stringify(extraction)}`;
    const orchestration = await this.runOrchestrationPhase(
      openai,
      agentModel,
      model,
      orchPrompt,
      extraction,
    );

    return { ...extraction, ...orchestration };
  }

  private buildUserPrompt(params: {
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
    recentDoneSection?: string;
    recentDismissedSection?: string;
    todayCalendarSection?: string;
    userActivityLine?: string;
    userLists?: { id: string; name: string }[];
  }): string {
    const tz = params.userTimezone ?? 'UTC';
    const nowLocal = DateTime.now().setZone(tz);
    const fmt = (iso: string) => {
      const dt = DateTime.fromISO(iso, { zone: 'utc' }).setZone(tz);
      return dt.isValid ? dt.toFormat('ccc MMM d, h:mm a') : iso;
    };

    const cappedExtracts = params.openExtracts.slice(0, 60);
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
          (extraExtracts > 0
            ? `\n(${extraExtracts} more tasks not shown — ask the user to be specific if they reference one not listed)`
            : '')
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

    const addressingBlock = params.userName
      ? `## Addressing the user\n- Preferred name: ${params.userName}\n- Use it naturally when it fits (not every message). Never invent or use a different name.\n`
      : `## Addressing the user\n- Name is not on file. Do not guess a name. If it feels natural, you may ask what they prefer to be called.\n`;

    return `${summaryBlock}

${addressingBlock}
Current time: ${nowLocal.toFormat('cccc, MMMM d, yyyy h:mm a ZZZZ')} (${tz})

## Open tasks
${openTasksSection}

## User's lists
${params.userLists && params.userLists.length > 0 ? params.userLists.map((l) => `- ${l.name}`).join('\n') : '(no lists yet — defaults: Shopping, Errands, Ideas)'}

## Calendar (upcoming)
${calendarSection}

## Memory
${params.memorySection || '(none yet)'}

## Recent conversation
${recentSection || '(start of conversation)'}

${params.userActivityLine ? `## Activity\n${params.userActivityLine}\n\n` : ''}${params.todayCalendarSection ? `## Today (timed items on your list)\n${params.todayCalendarSection}\n\n` : ''}${params.recentDoneSection ? `## Recently completed tasks\n${params.recentDoneSection}\n\n` : ''}${params.recentDismissedSection ? `## Recently dismissed (do not recreate)\n${params.recentDismissedSection}\n\n` : ''}${params.ragContext ? `## Related past context (vector memory)\n${params.ragContext}\n\n` : ''}${params.schedulingContext ? `## Free time slots\n${params.schedulingContext}\n\n` : ''}${params.userPreferences ? `## Scheduling preferences\n${params.userPreferences}\n\n` : ''}## User message
"${truncateForPrompt(params.messageContent)}"`;
  }

  private async runExtractionPhase(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    model: Parameters<typeof generateText>[0]['model'],
    prompt: string,
  ): Promise<PemExtractionOutput> {
    const empty: PemExtractionOutput = {
      creates: [],
      updates: [],
      completions: [],
    };

    for (let attempt = 0; attempt < PEM_EXTRACTION_ATTEMPTS; attempt++) {
      try {
        const result = await generateText({
          model,
          system: SYSTEM_EXTRACTION,
          prompt,
          output: Output.object({ schema: pemExtractionOutputSchema }),
          temperature: 0.15,
          maxRetries: 1,
          maxOutputTokens: 4096,
          providerOptions: { openai: { strictJsonSchema: false } },
        });

        if (result.output != null) {
          return result.output;
        }

        const raw = result.text?.trim();
        this.log.warn(
          `PemAgent extraction attempt ${attempt + 1}: no object. finish=${result.finishReason}, text=${raw?.slice(0, 200)}`,
        );
        const recovered = this.tryRecoverExtractionFromRaw(raw);
        if (recovered) {
          this.log.warn(
            `PemAgent: extraction recovered from model text (attempt ${attempt + 1})`,
          );
          return recovered;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(
          `PemAgent extraction attempt ${attempt + 1}/${PEM_EXTRACTION_ATTEMPTS}: ${msg}`,
        );
        if (attempt < PEM_EXTRACTION_ATTEMPTS - 1) {
          await sleep(350 * (attempt + 1));
        }
      }
    }

    try {
      const recovered = await this.runExtractionJsonRecovery(
        openai,
        agentModel,
        prompt,
      );
      if (recovered) {
        this.log.warn('PemAgent: extraction JSON recovery produced output');
        return recovered;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`PemAgent extraction recovery error: ${msg}`);
    }

    return empty;
  }

  private async runOrchestrationPhase(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    model: Parameters<typeof generateText>[0]['model'],
    orchPrompt: string,
    extraction: PemExtractionOutput,
  ): Promise<PemOrchestrationOutput> {
    for (let attempt = 0; attempt < PEM_ORCHESTRATION_ATTEMPTS; attempt++) {
      try {
        const result = await generateText({
          model,
          system: SYSTEM_ORCHESTRATION,
          prompt: orchPrompt,
          output: Output.object({ schema: pemOrchestrationOutputSchema }),
          temperature: 0.35,
          maxRetries: 1,
          maxOutputTokens: 4096,
          providerOptions: { openai: { strictJsonSchema: false } },
        });

        if (result.output != null) {
          return result.output;
        }

        const raw = result.text?.trim();
        this.log.warn(
          `PemAgent orchestration attempt ${attempt + 1}: no object. finish=${result.finishReason}, text=${raw?.slice(0, 200)}`,
        );
        const recovered = this.tryRecoverOrchestrationFromRaw(raw);
        if (recovered) {
          this.log.warn(
            `PemAgent: orchestration recovered from model text (attempt ${attempt + 1})`,
          );
          return recovered;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(
          `PemAgent orchestration attempt ${attempt + 1}/${PEM_ORCHESTRATION_ATTEMPTS}: ${msg}`,
        );
        if (attempt < PEM_ORCHESTRATION_ATTEMPTS - 1) {
          await sleep(350 * (attempt + 1));
        }
      }
    }

    try {
      const recovered = await this.runOrchestrationJsonRecovery(
        openai,
        agentModel,
        orchPrompt,
      );
      if (recovered) {
        this.log.warn('PemAgent: orchestration JSON recovery produced output');
        return recovered;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`PemAgent orchestration recovery error: ${msg}`);
    }

    this.log.warn(
      'PemAgent: orchestration failed after retries — synthesizing response from extraction',
    );
    return this.synthesizeOrchestration(extraction);
  }

  private async runMonolithicPhase(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    model: Parameters<typeof generateText>[0]['model'],
    prompt: string,
    fallback: PemAgentOutput,
  ): Promise<PemAgentOutput> {
    for (let attempt = 0; attempt < PEM_AGENT_STRUCTURED_ATTEMPTS; attempt++) {
      try {
        const result = await generateText({
          model,
          system: SYSTEM_MONOLITHIC,
          prompt,
          output: Output.object({ schema: pemAgentOutputSchema }),
          temperature: 0.25,
          maxRetries: 1,
          maxOutputTokens: 4096,
          providerOptions: { openai: { strictJsonSchema: false } },
        });

        if (result.output != null) {
          return result.output;
        }

        const raw = result.text?.trim();
        this.log.warn(
          `PemAgent monolithic attempt ${attempt + 1}: no object. finish=${result.finishReason}, text=${raw?.slice(0, 200)}`,
        );
        const recovered = this.tryRecoverFromRawText(raw, fallback);
        if (recovered) {
          this.log.warn(
            `PemAgent: monolithic recovered from model text (attempt ${attempt + 1})`,
          );
          return recovered;
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        this.log.warn(
          `PemAgent monolithic attempt ${attempt + 1}/${PEM_AGENT_STRUCTURED_ATTEMPTS}: ${msg}`,
        );
        if (attempt < PEM_AGENT_STRUCTURED_ATTEMPTS - 1) {
          await sleep(350 * (attempt + 1));
        }
      }
    }

    try {
      const recovered = await this.runJsonRecoveryPass(
        openai,
        agentModel,
        prompt,
        fallback,
      );
      if (recovered) {
        this.log.warn('PemAgent: monolithic JSON recovery produced output');
        return recovered;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`PemAgent monolithic recovery error: ${msg}`);
    }

    this.log.error('PemAgent: monolithic path failed — using minimal fallback');
    return fallback;
  }

  private synthesizeOrchestration(
    extraction: PemExtractionOutput,
  ): PemOrchestrationOutput {
    const bits: string[] = [];
    if (extraction.creates.length > 0) {
      bits.push(
        `I added ${extraction.creates.length} thing${extraction.creates.length === 1 ? '' : 's'} to your list.`,
      );
    }
    if (extraction.updates.length > 0) {
      bits.push(
        `Updated ${extraction.updates.length} item${extraction.updates.length === 1 ? '' : 's'}.`,
      );
    }
    if (extraction.completions.length > 0) {
      bits.push(
        `Checked off ${extraction.completions.length} item${extraction.completions.length === 1 ? '' : 's'}.`,
      );
    }
    return {
      ...DEFAULT_ORCHESTRATION,
      response_text: bits.join(' ') || DEFAULT_ORCHESTRATION.response_text,
    };
  }

  private tryRecoverExtractionFromRaw(
    raw: string | undefined | null,
  ): PemExtractionOutput | null {
    if (!raw?.trim()) return null;
    const normalized = this.stripMarkdownJsonFence(raw.trim());
    const jsonMatch = normalized.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
    const result = pemExtractionOutputSchema.safeParse(parsed);
    if (result.success) return result.data;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return this.recoverPartialExtractionOutput(
      parsed as Record<string, unknown>,
    );
  }

  private recoverPartialExtractionOutput(
    o: Record<string, unknown>,
  ): PemExtractionOutput | null {
    const mapArr = <T>(v: unknown, schema: z.ZodType<T>): T[] =>
      Array.isArray(v)
        ? v.flatMap((item) => {
            const r = schema.safeParse(item);
            return r.success ? [r.data] : [];
          })
        : [];

    const creates = mapArr(o.creates, extractActionSchema);
    const updates = mapArr(o.updates, updateActionSchema);
    const completions = mapArr(o.completions, completeActionSchema);
    if (creates.length + updates.length + completions.length === 0) return null;
    return { creates, updates, completions };
  }

  private async runExtractionJsonRecovery(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    userPrompt: string,
  ): Promise<PemExtractionOutput | null> {
    const model = openai(agentModel);
    const { text } = await generateText({
      model,
      system: JSON_RECOVERY_EXTRACTION,
      prompt: userPrompt,
      temperature: 0.1,
      maxRetries: 2,
      maxOutputTokens: 4096,
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    return this.tryRecoverExtractionFromRaw(text);
  }

  private tryRecoverOrchestrationFromRaw(
    raw: string | undefined | null,
  ): PemOrchestrationOutput | null {
    if (!raw?.trim()) return null;
    const normalized = this.stripMarkdownJsonFence(raw.trim());
    const jsonMatch = normalized.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }
    const result = pemOrchestrationOutputSchema.safeParse(parsed);
    if (result.success) return result.data;
    if (typeof parsed !== 'object' || parsed === null) return null;
    return this.recoverPartialOrchestrationOutput(
      parsed as Record<string, unknown>,
    );
  }

  private recoverPartialOrchestrationOutput(
    o: Record<string, unknown>,
  ): PemOrchestrationOutput | null {
    const mapArr = <T>(v: unknown, schema: z.ZodType<T>): T[] =>
      Array.isArray(v)
        ? v.flatMap((item) => {
            const r = schema.safeParse(item);
            return r.success ? [r.data] : [];
          })
        : [];

    const calendar_writes = mapArr(o.calendar_writes, calendarWriteSchema);
    const memory_writes = mapArr(o.memory_writes, memoryWriteSchema);
    const calendar_updates = mapArr(o.calendar_updates, calendarUpdateSchema);
    const calendar_deletes = mapArr(o.calendar_deletes, calendarDeleteSchema);
    const scheduling = mapArr(o.scheduling, schedulingSchema);
    const recurrence_detections = mapArr(
      o.recurrence_detections,
      recurrenceDetectionSchema,
    );
    const rsvp_actions = mapArr(o.rsvp_actions, rsvpActionSchema);

    const hasWork =
      calendar_writes.length > 0 ||
      memory_writes.length > 0 ||
      calendar_updates.length > 0 ||
      calendar_deletes.length > 0 ||
      scheduling.length > 0 ||
      recurrence_detections.length > 0 ||
      rsvp_actions.length > 0;

    let response_text =
      typeof o.response_text === 'string' && o.response_text.trim()
        ? o.response_text.trim()
        : '';

    if (!response_text && hasWork) {
      const bits: string[] = [];
      if (calendar_writes.length) bits.push(`Scheduled on your calendar.`);
      if (memory_writes.length) bits.push(`Saved to memory.`);
      if (calendar_updates.length) bits.push(`Updated calendar events.`);
      if (calendar_deletes.length) bits.push(`Removed calendar events.`);
      if (scheduling.length) bits.push(`Suggested times.`);
      if (rsvp_actions.length) bits.push(`Updated RSVPs.`);
      response_text = bits.join(' ') || "I've got that.";
    }

    if (!response_text) return null;

    return {
      response_text,
      calendar_writes,
      memory_writes,
      calendar_updates,
      calendar_deletes,
      scheduling,
      recurrence_detections,
      rsvp_actions,
      summary_update:
        typeof o.summary_update === 'string' ? o.summary_update : null,
      polished_text:
        typeof o.polished_text === 'string' ? o.polished_text : null,
    };
  }

  private async runOrchestrationJsonRecovery(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    userPrompt: string,
  ): Promise<PemOrchestrationOutput | null> {
    const model = openai(agentModel);
    const { text } = await generateText({
      model,
      system: JSON_RECOVERY_ORCHESTRATION,
      prompt: userPrompt,
      temperature: 0.15,
      maxRetries: 2,
      maxOutputTokens: 4096,
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    return this.tryRecoverOrchestrationFromRaw(text);
  }

  /**
   * Last resort: same prompt context, no structured-output mode — parse JSON from text.
   */
  private async runJsonRecoveryPass(
    openai: ReturnType<typeof createOpenAI>,
    agentModel: string,
    userPrompt: string,
    fallback: PemAgentOutput,
  ): Promise<PemAgentOutput | null> {
    const model = openai(agentModel);
    const { text } = await generateText({
      model,
      system: JSON_RECOVERY_SYSTEM,
      prompt: userPrompt,
      temperature: 0.2,
      maxRetries: 2,
      maxOutputTokens: 4096,
      providerOptions: { openai: { strictJsonSchema: false } },
    });
    return this.tryRecoverFromRawText(text, fallback);
  }

  private tryRecoverFromRawText(
    raw: string | undefined | null,
    fallback: PemAgentOutput,
  ): PemAgentOutput | null {
    if (!raw?.trim()) return null;

    const normalized = this.stripMarkdownJsonFence(raw.trim());
    const jsonMatch = normalized.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      if (raw.length > 10) {
        return { ...fallback, response_text: normalized.slice(0, 2000) };
      }
      return null;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      if (raw.length > 10) {
        return { ...fallback, response_text: normalized.slice(0, 2000) };
      }
      return null;
    }

    const result = pemAgentOutputSchema.safeParse(parsed);
    if (result.success) return result.data;

    if (typeof parsed !== 'object' || parsed === null) return null;

    const o = parsed as Record<string, unknown>;
    const recovered = this.recoverPartialAgentOutput(o);
    if (recovered) {
      this.log.warn(
        `Partial schema match — recovered fields without full Zod pass`,
      );
      return recovered;
    }

    return null;
  }

  /** Remove ```json ... ``` wrappers models sometimes add despite instructions. */
  private stripMarkdownJsonFence(s: string): string {
    let t = s.trim();
    if (t.startsWith('```')) {
      t = t.replace(/^```(?:json)?\s*\n?/i, '');
      t = t.replace(/\n?```\s*$/i, '');
    }
    return t.trim();
  }

  /** Build output from loose JSON when full schema validation fails. */
  private recoverPartialAgentOutput(
    o: Record<string, unknown>,
  ): PemAgentOutput | null {
    const mapArr = <T>(v: unknown, schema: z.ZodType<T>): T[] =>
      Array.isArray(v)
        ? v.flatMap((item) => {
            const r = schema.safeParse(item);
            return r.success ? [r.data] : [];
          })
        : [];

    const creates = mapArr(o.creates, extractActionSchema);
    const updates = mapArr(o.updates, updateActionSchema);
    const completions = mapArr(o.completions, completeActionSchema);
    const calendar_writes = mapArr(o.calendar_writes, calendarWriteSchema);
    const memory_writes = mapArr(o.memory_writes, memoryWriteSchema);
    const calendar_updates = mapArr(o.calendar_updates, calendarUpdateSchema);
    const calendar_deletes = mapArr(o.calendar_deletes, calendarDeleteSchema);
    const scheduling = mapArr(o.scheduling, schedulingSchema);
    const recurrence_detections = mapArr(
      o.recurrence_detections,
      recurrenceDetectionSchema,
    );
    const rsvp_actions = mapArr(o.rsvp_actions, rsvpActionSchema);

    const hasWork =
      creates.length > 0 ||
      updates.length > 0 ||
      completions.length > 0 ||
      calendar_writes.length > 0 ||
      memory_writes.length > 0 ||
      calendar_updates.length > 0 ||
      calendar_deletes.length > 0 ||
      scheduling.length > 0 ||
      recurrence_detections.length > 0 ||
      rsvp_actions.length > 0;

    let response_text =
      typeof o.response_text === 'string' && o.response_text.trim()
        ? o.response_text.trim()
        : '';

    if (!response_text && hasWork) {
      const bits: string[] = [];
      if (creates.length) bits.push(`Added ${creates.length} item(s).`);
      if (calendar_writes.length) bits.push(`Scheduled on your calendar.`);
      if (updates.length) bits.push(`Updated ${updates.length} item(s).`);
      if (completions.length) bits.push(`Marked ${completions.length} done.`);
      if (memory_writes.length) bits.push(`Saved to memory.`);
      response_text = bits.join(' ') || "I've got that.";
    }

    if (!response_text) return null;

    return {
      response_text,
      creates,
      updates,
      completions,
      calendar_writes,
      memory_writes,
      calendar_updates,
      calendar_deletes,
      scheduling,
      recurrence_detections,
      rsvp_actions,
      summary_update:
        typeof o.summary_update === 'string' ? o.summary_update : null,
      polished_text:
        typeof o.polished_text === 'string' ? o.polished_text : null,
    };
  }
}
