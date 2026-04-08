import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  askTurnsTable,
  dumpsTable,
  logsTable,
  type AskInputKind,
  type ExtractRow,
} from '../database/schemas';
import type { BriefBuckets } from '../extracts/extracts.service';
import { ExtractsService } from '../extracts/extracts.service';
import { ProfileService } from '../profile/profile.service';
import { TranscriptionService } from '../transcription/transcription.service';

const SYSTEM = `You are Pem, a personal thought organizer. The user is asking about their own data stored in Pem.

Rules:
- ONLY answer from the sections provided in the prompt for this question. Do not guess or invent items, events, or history. If something is not in the provided data, say clearly that you do not see it in Pem — do not make things up.
- ONLY answer questions about the user's own Pem data. If the question is unrelated, politely say: "I can only help with things you've dumped into Pem."
- Be concise and warm — like a smart friend who knows their schedule.
- Answer in plain text. NO markdown, NO bold, NO asterisks, NO bullet numbering like "1. **Title**". Just natural sentences and dashes for lists if needed.
- NEVER expose internal metadata (status, urgency, tone, batch_key, IDs). Speak about items by their name only.
- When listing items, just list their names cleanly — no labels, no parenthetical metadata.
- Keep answers short: 2-5 sentences unless the user asks for detail.

Data routing (critical):
- When the prompt includes "Open items (timeline)" or "Open shopping items", those are Pem extracts — tasks, calendar-linked items, errands, and structured to-dos. Use ONLY that section for questions about schedule, calendar, this week, tasks, reminders, inbox, shopping lists, errands, and follow-ups.
- When the prompt includes "Thought dumps", that is raw text the user saved. Use that section for questions about what they said, how often they mentioned something, themes in their wording, or anything that depends on verbatim history.
- If the question mixes both (e.g. tasks plus what they wrote), use both sections and keep each claim tied to the right section.
- Calendar events appear as extracts with event times and locations in the timeline data. For "what's on my calendar", "this week", "today", etc., use the timeline section — not dumps.`;

const askRouteSchema = z.object({
  tasksAndScheduleFromExtracts: z
    .boolean()
    .describe(
      'True for calendar, schedule, this week, today, tomorrow, tasks, to-dos, inbox, reminders, shopping lists, errands, follow-ups — anything Pem holds as structured extracts.',
    ),
  recallFromDumps: z
    .boolean()
    .describe(
      'True when the user asks what they said, wrote, or mentioned; counts; themes; or anything needing raw saved text history.',
    ),
  includeDoneOrDismissed: z
    .boolean()
    .describe(
      'True ONLY if they explicitly ask about completed, done, dismissed, or crossed-off items.',
    ),
  shoppingListOnly: z
    .boolean()
    .describe(
      'True when the question is ONLY an open shopping or groceries list — no general schedule.',
    ),
  fullOpenShoppingList: z
    .boolean()
    .describe(
      'True when they need every open shopping-tagged item (including someday), e.g. full shopping list alongside other task questions.',
    ),
});

type AskRoute = z.infer<typeof askRouteSchema>;

const DEFAULT_ROUTE: AskRoute = {
  tasksAndScheduleFromExtracts: true,
  recallFromDumps: true,
  includeDoneOrDismissed: false,
  shoppingListOnly: false,
  fullOpenShoppingList: false,
};

@Injectable()
export class AskService {
  private readonly log = new Logger(AskService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly profile: ProfileService,
    private readonly transcription: TranscriptionService,
    private readonly extracts: ExtractsService,
  ) {}

  async answer(
    userId: string,
    question: string,
    opts?: { inputKind?: AskInputKind },
  ): Promise<{ answer: string; sources: { id: string; text: string }[] }> {
    const inputKind = opts?.inputKind ?? 'text';
    const q = question.trim();
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      const msg = "I can't process questions right now.";
      await this.persistAskTurn(userId, q, msg, [], inputKind, null);
      await this.logAskEntry(userId, q, msg);
      return { answer: msg, sources: [] };
    }

    const route = await this.classifyAskRoute(q, apiKey);
    const [memorySection, closedExtracts, recentDumps] = await Promise.all([
      this.profile.buildMemoryPromptSection(userId),
      route.includeDoneOrDismissed
        ? this.extracts.getAskClosedExtracts(userId, 80)
        : Promise.resolve([] as ExtractRow[]),
      this.getRecentDumpsForRoute(userId, route.recallFromDumps),
    ]);

    let timeline: BriefBuckets | null = null;
    let shoppingRows: ExtractRow[] = [];

    if (route.tasksAndScheduleFromExtracts) {
      if (route.shoppingListOnly) {
        shoppingRows = await this.extracts.getAskOpenShoppingExtracts(userId);
      } else {
        timeline = await this.extracts.getAskOpenTimelineBuckets(userId);
        if (route.fullOpenShoppingList) {
          shoppingRows = await this.extracts.getAskOpenShoppingExtracts(userId);
        }
      }
    }

    const extractsContext = this.buildExtractsPromptSections({
      timeline,
      shoppingRows,
      closedExtracts,
    });

    const dumpsContext = route.recallFromDumps
      ? recentDumps
          .map(
            (d) =>
              `[dump ${d.id}] ${(d.polishedText || d.dumpText).slice(0, 500)}`,
          )
          .join('\n')
      : '';

    const routingNote = this.buildRoutingNote(route);

    const openai = createOpenAI({ apiKey });
    const model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    const prompt = `${routingNote}

## Open items (extracts — tasks, calendar, structured to-dos)
${extractsContext || '(not loaded for this question)'}

## Thought dumps (raw saved text)
${dumpsContext || '(not loaded for this question)'}

## Memory
${memorySection || '(none)'}

## Question
"${q}"`;

    const allExtractRowsForSources: ExtractRow[] = [
      ...this.flattenBriefBuckets(timeline),
      ...shoppingRows,
      ...closedExtracts,
    ];
    const uniqueById = new Map<string, ExtractRow>();
    for (const e of allExtractRowsForSources) {
      uniqueById.set(e.id, e);
    }
    const extractList = [...uniqueById.values()];

    try {
      const result = await generateText({
        model: openai(model),
        system: SYSTEM,
        prompt,
      });

      const sources = extractList
        .filter((e) => result.text.includes(e.extractText.slice(0, 30)))
        .slice(0, 5)
        .map((e) => ({ id: e.id, text: e.extractText }));

      await this.persistAskTurn(
        userId,
        q,
        result.text,
        sources,
        inputKind,
        null,
      );
      await this.logAskEntry(userId, q, result.text);

      return { answer: result.text, sources };
    } catch (err) {
      this.log.error('Ask Pem failed', err instanceof Error ? err.stack : err);
      const fallback = "Sorry, I couldn't process that right now. Try again.";
      await this.persistAskTurn(
        userId,
        q,
        fallback,
        [],
        inputKind,
        this.serializeErr(err),
      );
      await this.logAskEntry(userId, q, null, err);
      return {
        answer: fallback,
        sources: [],
      };
    }
  }

  /** Whisper → Ask only. Never creates a dump or uploads audio. */
  async answerFromVoice(
    userId: string,
    audio: Express.Multer.File,
  ): Promise<{
    text: string;
    answer: string;
    sources: { id: string; text: string }[];
  }> {
    const text = await this.transcription.transcribe(audio);
    const { answer, sources } = await this.answer(userId, text, {
      inputKind: 'voice',
    });
    return { text, answer, sources };
  }

  async listHistory(userId: string, limitRaw?: number) {
    const limit = Math.min(Math.max(limitRaw ?? 30, 1), 100);
    const rows = await this.db
      .select()
      .from(askTurnsTable)
      .where(eq(askTurnsTable.userId, userId))
      .orderBy(desc(askTurnsTable.createdAt))
      .limit(limit);

    return {
      turns: rows.map((r) => ({
        id: r.id,
        question_text: r.questionText,
        answer_text: r.answerText,
        sources: r.sources,
        input_kind: r.inputKind,
        error: r.error,
        created_at: r.createdAt.toISOString(),
      })),
    };
  }

  private buildRoutingNote(route: AskRoute): string {
    const parts: string[] = ['## How to use the data for this question'];
    if (route.tasksAndScheduleFromExtracts) {
      if (route.shoppingListOnly) {
        parts.push(
          '- Use the open shopping items section for the answer. Do not use dumps for shopping unless the user explicitly asks what they wrote about shopping.',
        );
      } else {
        parts.push(
          '- For schedule, calendar, tasks, and this week: use the timeline under open items. Do not infer schedule from dumps.',
        );
      }
      if (route.fullOpenShoppingList && !route.shoppingListOnly) {
        parts.push(
          '- For anything about a shopping list: use the open shopping items section so nothing is missed (including low-urgency items).',
        );
      }
    } else {
      parts.push(
        '- Open items were not loaded; do not describe tasks or calendar from memory.',
      );
    }
    if (route.recallFromDumps) {
      parts.push(
        '- For what they said or repeated themes: use thought dumps. If dumps are empty or silent on the topic, say you do not see it.',
      );
    } else {
      parts.push(
        '- Thought dumps were not loaded; do not quote or summarize old dump wording.',
      );
    }
    if (route.includeDoneOrDismissed) {
      parts.push(
        '- The user asked about completed or dismissed items: you may use the closed items section. Otherwise ignore it.',
      );
    }
    parts.push(
      '- If the answer is not in the loaded sections, say you do not see it in Pem — never invent.',
    );
    return parts.join('\n');
  }

  private flattenBriefBuckets(b: BriefBuckets | null): ExtractRow[] {
    if (!b) return [];
    return [
      ...b.overdue,
      ...b.today,
      ...b.tomorrow,
      ...b.this_week,
      ...b.next_week,
      ...b.later,
    ];
  }

  private formatExtractLine(e: ExtractRow): string {
    const parts = [e.extractText];
    if (e.dueAt) parts.push(`due ${e.dueAt.toISOString()}`);
    if (e.periodLabel) parts.push(e.periodLabel);
    if (e.eventStartAt) {
      const start = e.eventStartAt.toISOString();
      const end = e.eventEndAt ? e.eventEndAt.toISOString() : null;
      parts.push(`calendar event ${start}${end ? ` to ${end}` : ''}`);
      if (e.eventLocation) parts.push(`at ${e.eventLocation}`);
    }
    return parts.join(' — ');
  }

  private formatBucket(label: string, rows: ExtractRow[]): string | undefined {
    if (rows.length === 0) return undefined;
    const lines = rows.map((r) => this.formatExtractLine(r)).join('\n');
    return `${label}:\n${lines}`;
  }

  private buildExtractsPromptSections(opts: {
    timeline: BriefBuckets | null;
    shoppingRows: ExtractRow[];
    closedExtracts: ExtractRow[];
  }): string {
    const chunks: string[] = [];

    if (opts.timeline) {
      const b = opts.timeline;
      const sections = [
        this.formatBucket('Overdue', b.overdue),
        this.formatBucket('Today', b.today),
        this.formatBucket('Tomorrow', b.tomorrow),
        this.formatBucket('This week', b.this_week),
        this.formatBucket('Next week and later', b.next_week),
      ].filter(Boolean);
      chunks.push(
        sections.length > 0
          ? `Timeline:\n${sections.join('\n\n')}`
          : 'Timeline: (no open items in these buckets)',
      );
      const bc = b.batch_counts
        .filter((x) => x.count > 0)
        .map((x) => `${x.batch_key}: ${x.count}`)
        .join(', ');
      if (bc) chunks.push(`Batch counts (open): ${bc}`);
    }

    if (opts.shoppingRows.length > 0) {
      const lines = opts.shoppingRows
        .map((r) => this.formatExtractLine(r))
        .join('\n');
      chunks.push(`Open shopping items (all urgencies, not done):\n${lines}`);
    }

    if (opts.closedExtracts.length > 0) {
      const lines = opts.closedExtracts
        .map((r) => this.formatExtractLine(r))
        .join('\n');
      chunks.push(`Closed items (done or dismissed — user asked):\n${lines}`);
    }

    return chunks.join('\n\n');
  }

  private async getRecentDumpsForRoute(
    userId: string,
    recallFromDumps: boolean,
  ) {
    const limit = recallFromDumps ? 28 : 0;
    if (limit === 0) return [];
    return this.db
      .select({
        id: dumpsTable.id,
        dumpText: dumpsTable.dumpText,
        polishedText: dumpsTable.polishedText,
      })
      .from(dumpsTable)
      .where(eq(dumpsTable.userId, userId))
      .orderBy(desc(dumpsTable.createdAt))
      .limit(limit);
  }

  private async classifyAskRoute(
    question: string,
    apiKey: string,
  ): Promise<AskRoute> {
    const openai = createOpenAI({ apiKey });
    const mini = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    try {
      const { output } = await generateText({
        model: openai(mini),
        output: Output.object({ schema: askRouteSchema }),
        system:
          'You route user questions for Pem. Be conservative: if unsure whether a question needs tasks/calendar vs raw dump history, set both tasksAndScheduleFromExtracts and recallFromDumps to true. shoppingListOnly is only when the question is exclusively a shopping/groceries list. fullOpenShoppingList is true when they need every open shopping item (e.g. "full shopping list", "everything I need to buy") even if they also ask other things.',
        prompt: `Classify this user question:\n"""${question.slice(0, 2000)}"""`,
        providerOptions: { openai: { strictJsonSchema: false } },
      });

      let route = output ?? DEFAULT_ROUTE;
      if (!route.tasksAndScheduleFromExtracts && !route.recallFromDumps) {
        route = { ...DEFAULT_ROUTE };
      }
      if (route.shoppingListOnly) {
        route = {
          ...route,
          tasksAndScheduleFromExtracts: true,
          fullOpenShoppingList: false,
        };
      }
      return route;
    } catch (e) {
      this.log.warn(
        `Ask route classification failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return { ...DEFAULT_ROUTE };
    }
  }

  private async persistAskTurn(
    userId: string,
    questionText: string,
    answerText: string | null,
    sources: { id: string; text: string }[],
    inputKind: AskInputKind,
    error: { message: string; stack?: string } | null,
  ) {
    try {
      await this.db.insert(askTurnsTable).values({
        userId,
        questionText: questionText.slice(0, 16_000),
        answerText: answerText ? answerText.slice(0, 32_000) : null,
        sources,
        inputKind,
        error,
      });
    } catch (e) {
      this.log.warn(
        `Failed to persist ask turn: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  private serializeErr(err: unknown): { message: string; stack?: string } {
    return {
      message:
        err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : 'Unknown error',
      stack: err instanceof Error ? err.stack?.slice(0, 4000) : undefined,
    };
  }

  private async logAskEntry(
    userId: string,
    question: string,
    answer: string | null,
    err?: unknown,
  ) {
    await this.db.insert(logsTable).values({
      userId,
      type: 'ask',
      isAgent: true,
      pemNote: answer ? answer.slice(0, 500) : 'Failed to answer',
      payload: { op: 'ask_pem', question: question.slice(0, 2000) },
      error: err
        ? {
            message:
              err instanceof Error
                ? err.message
                : typeof err === 'string'
                  ? err
                  : 'Unknown error',
            stack: err instanceof Error ? err.stack?.slice(0, 4000) : undefined,
          }
        : null,
    });
  }
}
