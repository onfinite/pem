import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';

import {
  extractionResultSchema,
  type ExtractedActionable,
} from './extraction.schema';

const SYSTEM = `You extract actionable items from a user's brain dump AND produce one polished rewrite of the whole dump.

Polished paragraph (polished_text):
- One coherent paragraph in prose (not bullets, not a task list).
- Reflect everything the user expressed; fix grammar and order for clarity only.
- Do not invent content or add tasks they did not imply.

Actionable items (items array):
- Each distinct actionable gets one row. Merge duplicates.
- Tone (non-negotiable, pick exactly one per item):
  - confident: user stated clearly they need to do this.
  - tentative: maybe, thinking about, not sure, considering.
  - idea: creative/product thought, not a personal to-do.
  - someday: aspirational, no real deadline ("learn guitar someday").
- Urgency:
  - today: must surface today or explicitly today / tonight / this morning.
  - this_week: this week, before the weekend, in a few days, no exact time.
  - someday: backlog / aspirational timing.
  - none: no time context.
- batch_key: only set when the line clearly fits: shopping (buy/get/order physical goods), calls (call/phone), emails (email/write/follow up), errands (go somewhere). Otherwise null. When in doubt, null.
- Datetimes: If user timezone is provided, interpret "Thursday 2pm", "tomorrow morning", "this weekend" in that zone. Output due_at OR period_start/end as ISO 8601 strings with offset. Weekend = Saturday 00:00 through Sunday 23:59 in that zone. "This week" = Monday 00:00 – Friday 23:59 unless stated otherwise. If timezone is MISSING, set due_at and period fields to null (do not guess UTC) and we will flag timezone_pending on save.
- Never invent tasks the user did not imply.
- pem_note: short, warm, specific — not generic. Can be null if nothing to add.
- draft_text: only if the dump clearly asks for an email/message draft; else null.`;

export type ExtractDumpResult = {
  polishedText: string;
  items: ExtractedActionable[];
};

@Injectable()
export class ExtractionService {
  private readonly log = new Logger(ExtractionService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * One LLM call: polished narrative of the full dump + structured actionables.
   */
  async extractFromDump(
    dumpText: string,
    userTimezone: string | null,
  ): Promise<ExtractDumpResult> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn('OPENAI_API_KEY missing — no extraction');
      return { polishedText: '', items: [] };
    }

    const openai = createOpenAI({ apiKey });
    const model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    const tzLine = userTimezone
      ? `User timezone (IANA): ${userTimezone}. Use it for all date interpretation.`
      : 'User timezone is UNKNOWN. Leave due_at, period_start, period_end null.';

    const result = await generateText({
      model: openai(model),
      output: Output.object({ schema: extractionResultSchema }),
      system: SYSTEM,
      prompt: `${tzLine}\n\nDump:\n"""${dumpText.trim()}"""`,
    });

    const parsed = result.output;
    if (!parsed) {
      return { polishedText: '', items: [] };
    }

    const polishedText = (parsed.polished_text ?? '').trim();
    const items = parsed.items?.length ? parsed.items : [];

    return { polishedText, items };
  }
}
