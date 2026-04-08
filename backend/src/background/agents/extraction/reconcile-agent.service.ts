import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';

import {
  reconcilePhaseSchema,
  type ExtractedItem,
  type ReconcilePhaseResult,
} from './extraction.schema';

const SYSTEM = `You are Pem's reconciliation agent (Phase 2 of 2). A prior agent already extracted items from the user's dump. Your job is to compare those items against the user's EXISTING open tasks and decide:

## 1) Deduplication (deduplications)
- Compare each new_item against open_tasks. If a new item is clearly the same obligation as an existing task, mark it as a duplicate so it won't be created twice.
- new_item_index: 0-based index into the new_items array.
- existing_id: UUID of the matching open task.
- reason: short explanation.

## 2) Merges (merge_operations)
- When a new item updates or extends an existing open task, emit a merge_operations entry.
- Also use merges for scheduling commands:
  - "move the laundry to today" → patch urgency to "today"
  - "move X to this week" → patch urgency to "this_week"
  - "batch X with shopping" → patch batch_key to "shopping" **only** if that task is about **buying goods** (groceries, supplies, things to purchase). Never use shopping for people-contact tasks.
  - "add a deadline to X — Friday" → patch due_at
- **batch_key rules (critical):**
  - **follow_ups** — calls, texts, emails, DMs, "reach out", "contact", talking to a **person** (mom, dad, doctor's office, dentist, client). A task like "Call my dad" is **always follow_ups**, never shopping.
  - **shopping** — things to **buy** (milk, gifts to purchase, order online). Not social calls.
  - **errands** — physical trips (laundry, post office, pick up package) that are not primarily "contact someone".
  - Do **not** set batch_key to shopping just because the user mentioned shopping in another sentence or because an unrelated task is shopping.
- Only reference UUIDs from the provided open_tasks list.
- patch: only fields that should change.
- confidence: high = apply full patch including dates; medium = apply text, tone, urgency, pem_note, draft only (no due_at/period/batch/recommended_at); low = skip.
- agent_log_note: required — short reason for audit.

## 3) Lifecycle commands (lifecycle_commands)
- mark_done, dismiss, or snooze an existing open task when the user's dump implies it.
- Examples that should trigger lifecycle commands:
  - "I found a co-founder" → mark_done the "find a co-founder" task (high confidence)
  - "I finished the laundry" / "laundry is done" → mark_done the laundry task
  - "remove the milk task" / "forget about the dentist" → dismiss that task
  - "done with shopping" → mark_done all shopping-batch items (emit one per task)
  - "snooze the email to next week" → snooze that task
  - "move groceries to tomorrow" → treat as merge (update urgency/due_at), not lifecycle
- Only high confidence for mark_done and dismiss. Snooze: high or medium.
- snooze_until_iso required when command is snooze.
- Never target done tasks (they are not in the list).
- Recognize implicit completion: if the user says something happened that resolves an open task (e.g. "bought the milk", "called the plumber"), that means mark_done.

## 4) Follow-ups (follow_up_writes)
- Optional reminders for open tasks. Only if confidence is high and the user implied a future check-in.
- Upserts one follow-up per actionable (server replaces existing row).

## 5) Calendar events (calendar_writes)
- When a new_item represents a meeting, appointment, or event with a clear date/time, emit a calendar_write.
- summary: short event title.
- start_at / end_at: ISO 8601 in user's local time with UTC offset (same rule as dates above). If only a time is given, assume 1 hour duration.
- new_item_index: 0-based index into the new_items array that this calendar event corresponds to. Required so we can link the extract to the calendar event. null only if the calendar write does not correspond to any new_item.
- confidence: high when date+time are explicit; medium when date is clear but time is vague; low = omit.
- These are IN ADDITION to new_items — the same event should appear as both.

## Rules
- Use the Memory section to understand the user's life context — it helps you decide whether items relate to existing tasks.
- Datetimes: The hour in the ISO string must be what the user's clock shows. Never do UTC math yourself.
- Only reference IDs that appear in the open_tasks list. Never reference done tasks.
- Be conservative: when unsure, use medium or low confidence, or omit entirely.`;

export type OpenTaskForReconcile = {
  id: string;
  text: string;
  status: string;
  tone: string;
  urgency: string;
  batch_key: string | null;
  due_at: string | null;
  period_label: string | null;
};

export type FollowUpForReconcile = {
  actionable_id: string;
  note: string | null;
  recommended_at: string | null;
};

export type ReconcileAgentInput = {
  dumpText: string;
  userTimezone: string | null;
  memoryPromptSection: string;
  newItems: ExtractedItem[];
  openTasks: OpenTaskForReconcile[];
  existingFollowUps: FollowUpForReconcile[];
};

function emptyResult(): ReconcilePhaseResult {
  return {
    merge_operations: [],
    lifecycle_commands: [],
    follow_up_writes: [],
    calendar_writes: [],
    deduplications: [],
  };
}

@Injectable()
export class ReconcileAgentService {
  private readonly log = new Logger(ReconcileAgentService.name);

  constructor(private readonly config: ConfigService) {}

  async run(input: ReconcileAgentInput): Promise<ReconcilePhaseResult> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn('OPENAI_API_KEY missing');
      return emptyResult();
    }

    if (input.openTasks.length === 0 && input.newItems.length === 0) {
      return emptyResult();
    }

    const openai = createOpenAI({ apiKey });
    const model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    const tzLine = input.userTimezone
      ? `User timezone (IANA): ${input.userTimezone}. All dates should use the user's LOCAL clock time + UTC offset.`
      : 'User timezone is UNKNOWN. Leave all date fields null.';

    const newItemsJson = JSON.stringify(
      input.newItems.map((item, i) => ({ index: i, ...item })),
      null,
      0,
    );
    const openTasksJson = JSON.stringify(input.openTasks, null, 0);
    const followUpsJson = JSON.stringify(input.existingFollowUps, null, 0);

    const prompt = `${tzLine}

## Memory
${input.memoryPromptSection}

## New items extracted from this dump (Phase 1 output)
${newItemsJson}

## User's open tasks (not done — merge or command only these IDs)
${openTasksJson}

## Existing follow-ups
${followUpsJson}

## Original dump (for context)
"""${input.dumpText.trim()}"""`;

    try {
      const result = await generateText({
        model: openai(model),
        output: Output.object({ schema: reconcilePhaseSchema }),
        system: SYSTEM,
        prompt,
        providerOptions: { openai: { strictJsonSchema: false } },
      });

      if (!result.output) {
        throw new Error('Reconcile agent returned null output');
      }

      return result.output;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      this.log.warn(
        `Reconcile agent failed, retrying without calendar_writes: ${msg}`,
      );

      try {
        const fallback = reconcilePhaseSchema.omit({ calendar_writes: true });
        const retry = await generateText({
          model: openai(model),
          output: Output.object({ schema: fallback }),
          system: SYSTEM,
          prompt,
          providerOptions: { openai: { strictJsonSchema: false } },
        });

        if (!retry.output) {
          throw new Error('Reconcile fallback returned null');
        }

        return { ...retry.output, calendar_writes: [] };
      } catch (retryErr) {
        const retryMsg =
          retryErr instanceof Error ? retryErr.message : 'unknown';
        this.log.error(`Reconcile retry also failed: ${retryMsg}`);
        throw new Error(
          `Reconcile failed: primary: ${msg} | fallback: ${retryMsg}`,
        );
      }
    }
  }
}
