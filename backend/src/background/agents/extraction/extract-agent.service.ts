import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';

import {
  extractPhaseSchema,
  type ExtractPhaseResult,
} from './extraction.schema';

const SYSTEM = `You are Pem's extraction agent (Phase 1 of 2). You receive a raw brain dump and extract structured information from it. A separate reconciliation agent will match your output against existing tasks — you do NOT need to worry about duplicates or merges.

## 1) Polished paragraph (polished_text)
- One coherent paragraph in prose (not bullets, not a task list).
- Fix grammar and clarity only; preserve meaning and intent exactly.
- Do not invent content, tasks, or obligations the user did not express.

## 2) New items (new_items)
- Each distinct actionable gets one row. Merge duplicates within THIS dump only.
- text: Clean, short title ONLY. Never include dates, times, or scheduling info — those go in due_at/period fields. E.g. "Meet John tomorrow at 1pm" → text: "Meet John", due_at: tomorrow at 13:00.
- Tone (exactly one):
  • confident — user stated this clearly.
  • tentative — maybe, thinking about, not sure if.
  • idea — non-actionable creative or business thought.
  • someday — aspirational, no deadline, no urgency.
- Urgency: today | this_week | someday | none.
- batch_key: shopping | errands | follow_ups | null.
  • shopping — buying items: groceries, online orders, supplies, things to purchase.
  • errands — ANY physical task or chore: laundry, dry cleaning, pick up packages, return items, post office, pharmacy, car wash, oil change, dropping things off, cleaning, tidying, taking out trash, watering plants, mowing lawn. If it involves DOING something physical, it is errands.
  • follow_ups — reaching out to someone: call, text, email, reply, follow up, send a message. Any task involving contacting or communicating with another person (including family: mom, dad, parents). **Calls to people are never shopping** — even if the user also mentioned groceries elsewhere in the dump.
  IMPORTANT: Default to a batch when possible. null ONLY for meetings, appointments, abstract thinking, or career/life goals.

## batch_key examples
"I need to do my laundry tomorrow" → batch_key: "errands"
"buy milk and eggs" → batch_key: "shopping"
"call the dentist to reschedule" → batch_key: "follow_ups"
"call my mom and dad" / "phone my parents" → batch_key: "follow_ups" (never shopping)
"think about career change" → batch_key: null, tone: "idea"
"pick up the package from the post office" → batch_key: "errands"
"meet John tomorrow at 2pm" → batch_key: null (it's a meeting)
- Datetimes: Use the current date/time provided below as your reference for "today", "tomorrow", "next week", etc.
  CRITICAL RULE: output as ISO 8601 using the user's LOCAL clock time + their UTC offset.
  If the user says "3 PM" and timezone is America/Los_Angeles (PDT, UTC-7):
    CORRECT: "2026-04-08T15:00:00-07:00" (local clock=15:00, offset=-07:00)
    WRONG:   "2026-04-08T22:00:00-07:00" (you converted to UTC then added offset — DOUBLE CONVERSION)
  The hour in the ISO string must be what the user's clock shows. Never do UTC math yourself.
  Weekend = Saturday 00:00 through Sunday 23:59 in that zone. If timezone UNKNOWN, leave due_at and period fields null.
- recommended_at: optional soft "revisit" time. Only when clearly useful; otherwise null.

## 3) Memory (memory_writes)
- Append durable facts: life context, goals, boundaries, health, big decisions — only when clearly stated and worth recalling.
- memory_key: short snake_case topic; note: concise fact.

## 4) agent_assumptions
- Short strings for anything ambiguous you interpreted (e.g. "before next week" → end of current week Sunday 23:59 local). Use [] if none.`;

export type ExtractAgentInput = {
  dumpText: string;
  userTimezone: string | null;
  memoryPromptSection: string;
};

@Injectable()
export class ExtractAgentService {
  private readonly log = new Logger(ExtractAgentService.name);

  constructor(private readonly config: ConfigService) {}

  async run(input: ExtractAgentInput): Promise<ExtractPhaseResult> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn('OPENAI_API_KEY missing');
      return {
        polished_text: '',
        new_items: [],
        memory_writes: [],
        agent_assumptions: [],
      };
    }

    const openai = createOpenAI({ apiKey });
    const model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    const tzLine = this.buildTimezoneContext(input.userTimezone);

    const prompt = `${tzLine}

## Memory
${input.memoryPromptSection}

## Raw dump
"""${input.dumpText.trim()}"""`;

    const result = await generateText({
      model: openai(model),
      output: Output.object({ schema: extractPhaseSchema }),
      system: SYSTEM,
      prompt,
      providerOptions: { openai: { strictJsonSchema: false } },
    });

    if (!result.output) {
      throw new Error('Extract agent returned null output');
    }

    return result.output;
  }

  private buildTimezoneContext(tz: string | null): string {
    let nowLocal: string;
    if (tz) {
      try {
        nowLocal = new Date().toLocaleString('en-US', {
          timeZone: tz,
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        });
      } catch {
        nowLocal = new Date().toISOString();
      }
      return `Current date/time: ${nowLocal}\nUser timezone (IANA): ${tz}. Use it for all date interpretation. "Tomorrow" means the day after the date above.`;
    }
    return `Current date/time (UTC): ${new Date().toISOString()}\nUser timezone is UNKNOWN. Leave due_at, period_start, period_end null.`;
  }
}
