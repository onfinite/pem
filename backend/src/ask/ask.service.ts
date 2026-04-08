import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { and, desc, eq, ne } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  extractsTable,
  dumpsTable,
  logsTable,
  type ExtractRow,
} from '../database/schemas';
import { ProfileService } from '../profile/profile.service';

const SYSTEM = `You are Pem, a personal thought organizer. The user is asking you a question about their own thoughts, tasks, ideas, calendar events, and life context stored in Pem.

Rules:
- ONLY answer questions about the user's own data. If the question is unrelated, politely say: "I can only help with things you've dumped into Pem."
- Be concise and warm — like a smart friend who knows their schedule.
- Answer in plain text. NO markdown, NO bold, NO asterisks, NO bullet numbering like "1. **Title**". Just natural sentences and dashes for lists if needed.
- NEVER expose internal metadata (status, urgency, tone, batch_key, IDs). Speak about items by their name only.
- When listing items, just list their names cleanly — no labels, no parenthetical metadata.
- Keep answers short: 2-5 sentences unless the user asks for detail.
- You have access to the user's calendar events (shown as extracts with event times and locations). When asked "what's in my calendar", "what do I have today/this week", or similar — reference calendar events with their times and locations naturally.`;

@Injectable()
export class AskService {
  private readonly log = new Logger(AskService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly profile: ProfileService,
  ) {}

  async answer(
    userId: string,
    question: string,
  ): Promise<{ answer: string; sources: { id: string; text: string }[] }> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      return { answer: "I can't process questions right now.", sources: [] };
    }

    const [extracts, recentDumps, memorySection] = await Promise.all([
      this.getRelevantExtracts(userId),
      this.getRecentDumps(userId),
      this.profile.buildMemoryPromptSection(userId),
    ]);

    const extractsContext = extracts
      .map((e) => {
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
      })
      .join('\n');

    const dumpsContext = recentDumps
      .map(
        (d) => `[dump ${d.id}] ${(d.polishedText || d.dumpText).slice(0, 300)}`,
      )
      .join('\n');

    const openai = createOpenAI({ apiKey });
    const model = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    const prompt = `## User's extracts (tasks/ideas/thoughts)
${extractsContext || '(none)'}

## Recent dumps
${dumpsContext || '(none)'}

## Memory
${memorySection || '(none)'}

## Question
"${question.trim()}"`;

    try {
      const result = await generateText({
        model: openai(model),
        system: SYSTEM,
        prompt,
      });

      const sources = extracts
        .filter((e) => result.text.includes(e.extractText.slice(0, 30)))
        .slice(0, 5)
        .map((e) => ({ id: e.id, text: e.extractText }));

      await this.logAskEntry(userId, question, result.text);

      return { answer: result.text, sources };
    } catch (err) {
      this.log.error('Ask Pem failed', err instanceof Error ? err.stack : err);
      await this.logAskEntry(userId, question, null, err);
      return {
        answer: "Sorry, I couldn't process that right now. Try again.",
        sources: [],
      };
    }
  }

  private async getRelevantExtracts(userId: string): Promise<ExtractRow[]> {
    return this.db
      .select()
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, userId),
          ne(extractsTable.status, 'done'),
          ne(extractsTable.status, 'dismissed'),
        ),
      )
      .orderBy(desc(extractsTable.createdAt))
      .limit(50);
  }

  private async getRecentDumps(userId: string) {
    return this.db
      .select({
        id: dumpsTable.id,
        dumpText: dumpsTable.dumpText,
        polishedText: dumpsTable.polishedText,
      })
      .from(dumpsTable)
      .where(eq(dumpsTable.userId, userId))
      .orderBy(desc(dumpsTable.createdAt))
      .limit(10);
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
