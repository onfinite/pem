import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';

import {
  extractionResultSchema,
  type ExtractionResult,
} from './extraction.schema';

const SYSTEM = `You are Pem's extraction agent. You receive a raw brain dump and structured context: user timezone, saved memory (memory_facts), open tasks (not done), and any existing follow-up reminders.

## 1) Polished paragraph (polished_text)
- One coherent paragraph in prose (not bullets, not a task list).
- Fix grammar and clarity only; preserve meaning and intent exactly.
- Do not invent content, tasks, or obligations the user did not express.

## 2) Actionable items — NEW (new_items)
- Each distinct new actionable gets one row. Merge duplicates within this dump.
- Tone (exactly one per item): confident | tentative | idea | someday (same definitions as before: tentative when unsure).
- Urgency: today | this_week | someday | none.
- batch_key: shopping | calls | emails | errands | null.
  • shopping — buying items: groceries, online orders, supplies.
  • calls — phone calls to make: doctor, accountant, landlord, etc.
  • emails — emails or messages to send.
  • errands — physical tasks you go do: laundry, dry cleaning, pick up packages, return items, post office, pharmacy, car wash, oil change, dropping things off.
  null only when the item genuinely doesn't fit any batch. When in doubt between null and a batch, prefer the batch.
- Datetimes: With user timezone, interpret natural language. Output due_at OR period_start/end as ISO 8601 with offset. Weekend = Saturday 00:00 through Sunday 23:59 in that zone. If timezone UNKNOWN, leave due_at and period fields null (timezone_pending is set server-side).
- recommended_at: optional soft "revisit" time (ISO). Only when clearly useful; otherwise null. Never guess wildly.

## 3) MERGE into existing tasks (merge_operations)
- You receive a list of open tasks (inbox, snoozed, dismissed — never done). Match when the user is clearly continuing the same obligation (e.g. landlord follow-up with new deadline).
- Only reference actionable_id values from the provided list. Never reference done tasks (they are not listed).
- patch: only fields that should change. For date changes, be conservative: use confidence high only when the dump clearly updates timing.
- agent_log_note: required — short reason for audit.
- confidence: high = apply full patch including dates; medium = apply text, tone, urgency, pem_note, draft only (no due_at/period/batch/recommended_at); low = do not merge (omit or skip).

## 4) DIRECT commands (lifecycle_commands)
- mark_done, dismiss, or snooze an existing open task when the user clearly asks (e.g. "mark the guitar thing done", "snooze landlord until Friday").
- snooze: set snooze_until_iso when command is snooze.
- Only high confidence for mark_done and dismiss. Snooze: high or medium.
- Never target done tasks.

## 5) Follow-ups (follow_up_writes)
- Optional reminders for open tasks. Only if confidence is high and the user implied a future check-in.
- Upserts one follow-up per actionable (server replaces existing row for that actionable_id).
- If unsure, omit or use low confidence (server will skip low).

## 6) Memory (memory_writes)
- Append durable facts: life context, goals, boundaries, health, big decisions — only when clearly stated and worth recalling.
- memory_key: short snake_case topic; note: concise fact.
- Use normalize-style keys (e.g. career_goal, lease_situation).

## 7) agent_assumptions
- Short strings for anything ambiguous you interpreted (e.g. "before next week" → end of current week Sunday 23:59 local). Use an empty array if none.`;

export type OpenActionableForPrompt = {
  id: string;
  text: string;
  status: string;
  tone: string;
  urgency: string;
  batch_key: string | null;
  due_at: string | null;
  period_label: string | null;
};

export type FollowUpForPrompt = {
  actionable_id: string;
  note: string | null;
  recommended_at: string | null;
};

export type ExtractFromDumpInput = {
  dumpText: string;
  userTimezone: string | null;
  memoryPromptSection: string;
  memoryFactKeys: string[];
  openActionables: OpenActionableForPrompt[];
  existingFollowUps: FollowUpForPrompt[];
};

/** Full extraction payload including server-built audit fields. */
export type ExtractDumpResult = ExtractionResult & {
  additional_context: Record<string, unknown> | null;
};

function buildAdditionalContext(
  input: ExtractFromDumpInput,
): Record<string, unknown> {
  return {
    memory_keys_referenced: [...input.memoryFactKeys],
    open_task_count: input.openActionables.length,
    follow_up_count: input.existingFollowUps.length,
    summary:
      'Derived server-side from the memory keys, open tasks, and follow-ups included in the prompt.',
  };
}

function emptyResult(input?: ExtractFromDumpInput): ExtractDumpResult {
  return {
    polished_text: '',
    additional_context: input ? buildAdditionalContext(input) : null,
    agent_assumptions: [],
    memory_writes: [],
    new_items: [],
    merge_operations: [],
    lifecycle_commands: [],
    follow_up_writes: [],
  };
}

@Injectable()
export class ExtractionService {
  private readonly log = new Logger(ExtractionService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * One LLM call: polished dump + structured extraction, merges, commands, memory, follow-ups.
   */
  async extractFromDump(
    input: ExtractFromDumpInput,
  ): Promise<ExtractDumpResult> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn('OPENAI_API_KEY missing — no extraction');
      return emptyResult(input);
    }

    const openai = createOpenAI({ apiKey });
    const model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    const tzLine = input.userTimezone
      ? `User timezone (IANA): ${input.userTimezone}. Use it for all date interpretation.`
      : 'User timezone is UNKNOWN. Leave due_at, period_start, period_end null.';

    const tasksJson = JSON.stringify(input.openActionables, null, 0);
    const followUpsJson = JSON.stringify(input.existingFollowUps, null, 0);
    const keysJson = JSON.stringify(input.memoryFactKeys, null, 0);

    const prompt = `${tzLine}

## Saved memory keys in context (memory_facts)
${keysJson}

${input.memoryPromptSection}

## Open tasks (not done — merge or command only these ids)
${tasksJson}

## Existing follow-ups (one per actionable if present)
${followUpsJson}

## Raw dump
"""${input.dumpText.trim()}"""`;

    const result = await generateText({
      model: openai(model),
      output: Output.object({ schema: extractionResultSchema }),
      system: SYSTEM,
      prompt,
      // Strict structured-output mode rejects some Zod→JSON-Schema shapes (e.g. propertyNames).
      providerOptions: {
        openai: {
          strictJsonSchema: false,
        },
      },
    });

    const parsed = result.output;
    if (!parsed) {
      return emptyResult(input);
    }

    return {
      polished_text: (parsed.polished_text ?? '').trim(),
      additional_context: buildAdditionalContext(input),
      agent_assumptions: parsed.agent_assumptions ?? [],
      memory_writes: parsed.memory_writes?.length ? parsed.memory_writes : [],
      new_items: parsed.new_items?.length ? parsed.new_items : [],
      merge_operations: parsed.merge_operations?.length
        ? parsed.merge_operations
        : [],
      lifecycle_commands: parsed.lifecycle_commands?.length
        ? parsed.lifecycle_commands
        : [],
      follow_up_writes: parsed.follow_up_writes?.length
        ? parsed.follow_up_writes
        : [],
    };
  }
}
