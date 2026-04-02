import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import {
  generateObject,
  generateText,
  stepCountIs,
  tool,
  type LanguageModel,
} from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  dumpsTable,
  prepRunLogsTable,
  prepsTable,
  type PrepType,
} from '../database/schemas';
import { TavilyService } from '../integrations/tavily.service';
import { PushService } from '../push/push.service';

@Injectable()
export class PrepRunnerService {
  private readonly log = new Logger(PrepRunnerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly tavily: TavilyService,
    private readonly push: PushService,
  ) {}

  async run(prepId: string): Promise<void> {
    const rows = await this.db
      .select({
        prep: prepsTable,
        transcript: dumpsTable.transcript,
      })
      .from(prepsTable)
      .innerJoin(dumpsTable, eq(prepsTable.dumpId, dumpsTable.id))
      .where(eq(prepsTable.id, prepId))
      .limit(1);

    const row = rows[0];
    if (!row) {
      this.log.warn(`prep not found ${prepId}`);
      return;
    }

    const { prep, transcript } = row;
    if (prep.status !== 'prepping') {
      return;
    }

    await this.appendLog(prepId, 'queued', 'Prep job picked up', {
      prepType: prep.prepType,
    });

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      await this.failPrep(prepId, 'OPENAI_API_KEY not configured');
      return;
    }

    const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
    const maxSteps = this.config.get<number>('agentMaxSteps') ?? 8;
    const openai = createOpenAI({ apiKey });
    const model = openai(modelId);

    const context = `User dump context:\n${transcript}\n\nPrep title: ${prep.title}`;

    try {
      const prepType = prep.prepType as PrepType;
      await this.appendLog(prepId, 'run', `Starting ${prepType} agent`, {
        model: modelId,
      });
      let summary: string;
      let result: Record<string, unknown>;

      switch (prepType) {
        case 'search':
          ({ summary, result } = await this.runSearch(
            prepId,
            model,
            context,
            maxSteps,
          ));
          break;
        case 'research':
          ({ summary, result } = await this.runResearch(
            prepId,
            model,
            context,
            maxSteps,
          ));
          break;
        case 'options':
          ({ summary, result } = await this.runOptions(prepId, model, context));
          break;
        case 'draft':
          ({ summary, result } = await this.runDraft(prepId, model, context));
          break;
        default:
          await this.failPrep(prepId, `Unknown prep_type: ${prep.prepType}`);
          return;
      }

      const now = new Date();
      await this.appendLog(prepId, 'done', 'Prep content saved', {});
      const [saved] = await this.db
        .update(prepsTable)
        .set({
          status: 'ready',
          summary,
          result,
          errorMessage: null,
          readyAt: now,
        })
        .where(
          and(eq(prepsTable.id, prepId), eq(prepsTable.status, 'prepping')),
        )
        .returning();

      if (!saved) {
        this.log.log(
          `prep ${prepId} skipped marking ready (no longer prepping — e.g. archived)`,
        );
        return;
      }

      await this.push.notifyPrepReady(saved.userId, prep.title);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`prep ${prepId} failed: ${msg}`);
      await this.failPrep(prepId, msg);
    }
  }

  private async failPrep(prepId: string, message: string): Promise<void> {
    const now = new Date();
    await this.appendLog(prepId, 'error', message.slice(0, 500), {});
    await this.db
      .update(prepsTable)
      .set({
        status: 'ready',
        summary: 'Something went wrong',
        errorMessage: message.slice(0, 2000),
        result: { error: true, message },
        readyAt: now,
      })
      .where(
        and(eq(prepsTable.id, prepId), eq(prepsTable.status, 'prepping')),
      );
  }

  private async appendLog(
    prepId: string,
    step: string,
    message: string,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.insert(prepRunLogsTable).values({
        prepId,
        step,
        message,
        meta: meta ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`prep_run_logs insert failed: ${msg}`);
    }
  }

  private async runSearch(
    prepId: string,
    model: LanguageModel,
    context: string,
    maxSteps: number,
  ): Promise<{ summary: string; result: Record<string, unknown> }> {
    await this.appendLog(prepId, 'search', 'Running web search + synthesis', {});
    const tavily = this.tavily;
    const result = await generateText({
      model,
      tools: {
        webSearch: tool({
          description: 'Search the public web for current information',
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }: { query: string }) => {
            const hits = await tavily.search(query, 5);
            return JSON.stringify(hits, null, 2);
          },
        }),
      },
      stopWhen: stepCountIs(maxSteps),
      prompt: `${context}\n\nUse webSearch one or more times, then answer concisely with a short opening line and details.`,
    });

    const text = result.text;
    const summary = text.split('\n')[0]?.slice(0, 280) ?? text.slice(0, 280);
    await this.appendLog(prepId, 'search', 'Search complete', {
      chars: text.length,
    });
    return {
      summary,
      result: {
        summary: text,
        keyPoints: [] as string[],
        sources: [] as string[],
      },
    };
  }

  private async runResearch(
    prepId: string,
    model: LanguageModel,
    context: string,
    maxSteps: number,
  ): Promise<{ summary: string; result: Record<string, unknown> }> {
    await this.appendLog(prepId, 'research', 'Running deep research', {});
    const tavily = this.tavily;
    const result = await generateText({
      model,
      tools: {
        webSearch: tool({
          description: 'Search for sources to synthesize',
          inputSchema: z.object({ query: z.string() }),
          execute: async ({ query }: { query: string }) => {
            const hits = await tavily.search(query, 5);
            return JSON.stringify(hits, null, 2);
          },
        }),
      },
      stopWhen: stepCountIs(maxSteps),
      prompt: `${context}\n\nUse several webSearch queries from different angles, then synthesize one structured answer.`,
    });

    const text = result.text;
    const summary = text.slice(0, 280);
    await this.appendLog(prepId, 'research', 'Research synthesis complete', {
      chars: text.length,
    });
    return {
      summary,
      result: {
        summary: text,
        keyPoints: [] as string[],
        sources: [] as string[],
      },
    };
  }

  private async runOptions(
    prepId: string,
    model: LanguageModel,
    context: string,
  ): Promise<{ summary: string; result: Record<string, unknown> }> {
    await this.appendLog(prepId, 'options', 'Searching for product options', {});
    const hits = await this.tavily.search(
      `${context.slice(0, 500)} shopping buy options`,
      8,
    );
    await this.appendLog(prepId, 'options', 'Structuring options with model', {
      snippets: hits.length,
    });

    const { object } = await generateObject({
      model,
      schema: z.object({
        options: z
          .array(
            z.object({
              name: z.string(),
              price: z.string(),
              url: z.string(),
              why: z.string(),
            }),
          )
          .max(3),
        summary: z.string(),
      }),
      prompt: `Pick up to 3 real options from these search snippets. If a URL is unknown, use an empty string.

Snippets:
${JSON.stringify(hits, null, 2).slice(0, 8000)}

${context}`,
    });

    await this.appendLog(prepId, 'options', 'Options ready', {
      count: object.options.length,
    });
    return {
      summary: object.summary,
      result: { options: object.options },
    };
  }

  private async runDraft(
    prepId: string,
    model: LanguageModel,
    context: string,
  ): Promise<{ summary: string; result: Record<string, unknown> }> {
    await this.appendLog(prepId, 'draft', 'Generating paste-ready draft', {});
    const { object } = await generateObject({
      model,
      schema: z.object({
        subject: z.string().nullable(),
        body: z.string(),
        tone: z.string(),
        summary: z.string(),
      }),
      prompt: `Write a draft message the user can paste. ${context}`,
    });

    await this.appendLog(prepId, 'draft', 'Draft ready', {});
    return {
      summary: object.summary,
      result: {
        subject: object.subject,
        body: object.body,
        tone: object.tone,
      },
    };
  }
}
