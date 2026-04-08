import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod/v4';

import { AskService } from '../ask/ask.service';
import { DumpsService } from '../dumps/dumps.service';
import type { UserRow } from '../database/schemas';

export type IntakeIntent = 'dump' | 'question' | 'both';

export type IntakeResult = {
  intent: IntakeIntent;
  dump_id: string | null;
  text: string;
  answer: string | null;
  sources: { id: string; text: string }[];
};

const classifySchema = z.object({
  intent: z.enum(['dump', 'question', 'both']),
});

const CLASSIFY_SYSTEM = `Classify the user's input into exactly one intent.

- "dump" — sharing thoughts, tasks, plans, events, information, status updates, brain dumps, OR commands that change tasks (e.g. "mark X done", "remove the laundry", "move shopping to today", "I finished the report", "batch errands together"). Any input that should be remembered, acted on, or triggers a change is a dump.
- "question" — ONLY asking about their existing data with no new information or commands: "what do I have today?", "did I mention the dentist?", "how many tasks this week?", "what's in my calendar?"
- "both" — input contains BOTH new information/commands AND a question. E.g. "I finished the laundry, what's left for today?" or "I just scheduled the dentist — what else do I have this week?"

When in doubt, prefer "dump" — it is the most common intent. Commands are always "dump", never "question".
Return JSON: { "intent": "dump" | "question" | "both" }`;

@Injectable()
export class IntakeService {
  private readonly log = new Logger(IntakeService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly dumps: DumpsService,
    private readonly ask: AskService,
  ) {}

  async process(user: UserRow, text: string): Promise<IntakeResult> {
    const trimmed = text.trim();
    if (!trimmed) {
      return {
        intent: 'dump',
        dump_id: null,
        text: trimmed,
        answer: null,
        sources: [],
      };
    }

    const intent = await this.classifyIntent(trimmed);

    if (intent === 'question') {
      const { answer, sources } = await this.ask.answer(user.id, trimmed);
      return { intent, dump_id: null, text: trimmed, answer, sources };
    }

    const { dumpId } = await this.dumps.createDump(user, trimmed);

    if (intent === 'both') {
      const { answer, sources } = await this.ask.answer(user.id, trimmed);
      return { intent, dump_id: dumpId, text: trimmed, answer, sources };
    }

    return {
      intent,
      dump_id: dumpId,
      text: trimmed,
      answer: null,
      sources: [],
    };
  }

  async processVoice(
    user: UserRow,
    audio: Express.Multer.File,
  ): Promise<IntakeResult> {
    const text = await this.dumps.transcribeAudio(audio);
    const intent = await this.classifyIntent(text);

    if (intent === 'question') {
      const { answer, sources } = await this.ask.answer(user.id, text);
      return { intent, dump_id: null, text, answer, sources };
    }

    const { dumpId } = await this.dumps.createDump(user, text);
    this.dumps.uploadAudioForDump(dumpId, audio).catch(() => {});

    if (intent === 'both') {
      const { answer, sources } = await this.ask.answer(user.id, text);
      return { intent, dump_id: dumpId, text, answer, sources };
    }

    return { intent, dump_id: dumpId, text, answer: null, sources: [] };
  }

  private async classifyIntent(text: string): Promise<IntakeIntent> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return 'dump';

    try {
      const openai = createOpenAI({ apiKey });
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        output: Output.object({ schema: classifySchema }),
        system: CLASSIFY_SYSTEM,
        prompt: text,
        providerOptions: { openai: { strictJsonSchema: false } },
      });
      return result.output?.intent ?? 'dump';
    } catch (err) {
      this.log.warn(
        `Intent classification failed, defaulting to dump: ${err instanceof Error ? err.message : 'unknown'}`,
      );
      return 'dump';
    }
  }
}
