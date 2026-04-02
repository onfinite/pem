import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output, stepCountIs, tool } from 'ai';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  dumpsTable,
  prepRunLogsTable,
  prepsTable,
  usersTable,
  type PrepRenderType,
  type PrepType,
} from '../database/schemas';
import { PrepEventsService } from '../events/prep-events.service';
import { TavilyService } from '../integrations/tavily.service';
import { ProfileService } from '../profile/profile.service';
import { PushService } from '../push/push.service';
import { StepsService } from '../steps/steps.service';

/**
 * Prep `result` must be a concrete Zod shape (not `z.any()`): OpenAI structured outputs
 * require every property in the JSON Schema to declare a `type`.
 */
const prepResultSchema = z.union([
  z.object({
    answer: z.string(),
    sources: z.array(z.string()),
  }),
  z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
    sources: z.array(z.string()),
  }),
  z.object({
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
  }),
  z.object({
    subject: z.string().nullable(),
    body: z.string(),
    tone: z.string(),
  }),
  z.object({
    sections: z.array(
      z.object({
        type: z.string(),
        body: z.string(),
      }),
    ),
  }),
]);

const structureSchema = z.object({
  summary: z.string(),
  renderType: z.enum(['search', 'research', 'options', 'draft', 'compound']),
  result: prepResultSchema,
});

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16_000);
}

function prepTypeFromRender(r: PrepRenderType): PrepType {
  if (r === 'compound') return 'research';
  return r;
}

/**
 * Runs the agentic prep loop for one thought: tools → structured result → persist → notify.
 */
@Injectable()
export class PrepRunnerService {
  private readonly log = new Logger(PrepRunnerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly tavily: TavilyService,
    private readonly push: PushService,
    private readonly profile: ProfileService,
    private readonly steps: StepsService,
    private readonly prepEvents: PrepEventsService,
  ) {}

  async run(prepId: string): Promise<void> {
    let dumpId: string | null = null;
    try {
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

      dumpId = row.prep.dumpId;
      const { prep, transcript } = row;

      if (prep.status !== 'prepping') {
        return;
      }

      await this.appendLog(prepId, 'queued', 'Prep job picked up', {});

      const apiKey = this.config.get<string>('openai.apiKey');
      if (!apiKey) {
        await this.failPrep(prepId, dumpId, 'OPENAI_API_KEY not configured');
        return;
      }

      const miniModelId =
        this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
      const agentModelId =
        this.config.get<string>('openai.agentModel') ?? 'gpt-4o';
      const maxSteps = this.config.get<number>('agentMaxSteps') ?? 10;
      const openai = createOpenAI({ apiKey });
      const agentModel = openai(agentModelId);
      const miniModel = openai(miniModelId);

      const userId = prep.userId;
      const [userRow] = await this.db
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);
      const profileMap = await this.profile.getProfileMap(userId);
      const prior =
        prep.context && typeof prep.context === 'object' ? prep.context : {};
      const mergedContext: Record<string, unknown> = {
        ...prior,
        user: {
          name: userRow?.name ?? null,
          email: userRow?.email ?? null,
        },
        profile: profileMap,
      };
      const ctx = JSON.stringify(mergedContext, null, 2);
      const displayName = userRow?.name?.trim() || null;

      const userPrompt = `Full dump transcript (context):
"""
${transcript}
"""

Thought to prep (this card):
${prep.thought || prep.title}

Enriched context (JSON) — includes the user's name/email and profile facts Pem has saved; use these for drafts, greetings, and sign-offs:
${ctx}

Use tools as needed. When finished, produce a clear final answer in plain language in your last message.`;

      await this.appendLog(prepId, 'run', 'Starting agent loop', {
        model: agentModelId,
      });

      const searchTool = tool({
        description:
          'Search the public web via Tavily for current facts, policies, products, prices',
        inputSchema: z.object({ query: z.string() }),
        execute: async ({ query }: { query: string }) => {
          const hits = await this.tavily.search(query, 6);
          return JSON.stringify(hits, null, 2);
        },
      });

      const fetchTool = tool({
        description:
          'Fetch a public web page URL and return readable text (use after search finds a relevant page)',
        inputSchema: z.object({ url: z.string().url() }),
        execute: async ({ url }: { url: string }) => {
          const res = await fetch(url, {
            headers: { 'User-Agent': 'PemBot/1.0' },
            signal: AbortSignal.timeout(20_000),
          });
          if (!res.ok) {
            return `HTTP ${res.status}`;
          }
          const html = await res.text();
          return stripHtml(html);
        },
      });

      const rememberTool = tool({
        description:
          'Read one profile key (snake_case, e.g. car, vehicle, location). Call before search when the profile might already have the answer.',
        inputSchema: z.object({ key: z.string() }),
        execute: async ({ key }: { key: string }) => {
          const v = await this.profile.remember(userId, key);
          return v ?? '(not set)';
        },
      });

      const saveTool = tool({
        description:
          'Write one profile fact (key + value) for future preps. Required when the user states something durable about themselves in the thought or transcript: vehicle they own or plan to sell, home, job, city, budget, etc. Use short snake_case keys (e.g. vehicle, car) and a concise value with year/model if given. Also use when you learn a new durable fact from tool output.',
        inputSchema: z.object({
          key: z.string(),
          value: z.string(),
        }),
        execute: async ({ key, value }: { key: string; value: string }) => {
          await this.profile.save(userId, key, value, prepId);
          return 'saved';
        },
      });

      const draftTool = tool({
        description:
          'Generate a paste-ready email or message body (goal + tone). Use when the user needs to send something.',
        inputSchema: z.object({
          goal: z.string(),
          tone: z.string(),
        }),
        execute: async ({ goal, tone }: { goal: string; tone: string }) => {
          const who =
            displayName ??
            '(name not on file — use a neutral greeting and no fake name)';
          const d = await generateText({
            model: agentModel,
            prompt: `Write a message the USER will paste and send as themselves.

The user's display name for greetings and sign-offs: ${who}
Use \`user\` and \`profile\` from the JSON context for specifics (location, role, preferences, etc.) when they improve the message. Do not invent a name if none is given.

Goal: ${goal}
Tone: ${tone}

Context:
${userPrompt}`,
          });
          return JSON.stringify({
            body: d.text,
            subject: null as string | null,
            tone,
          });
        },
      });

      const agentResult = await generateText({
        model: agentModel,
        system: `You are Pem's prep agent. Turn one thought into something the user can act on immediately.

Rules:
- The enriched context JSON includes user.name, user.email, and profile (facts Pem has saved). Use them for drafts, emails, and regards: real name for greetings and sign-offs when appropriate, profile facts for tone and specifics. Never invent a name if user.name is missing.
- If the user states a durable fact about themselves in this thought or the transcript (vehicle they own or want to sell, home, job, city, budget, constraints), call save() with a short snake_case key and a concise value—including year/make/model for cars. Do this even when the main task is search or research; it is not optional for stated possessions or situation.
- Call remember() before searching when the profile might already hold the fact (e.g. remember("vehicle") before pricing a car they mentioned).
- Use search() for current info; use fetch() on a specific result URL when you need exact wording, price, or policy.
- Use save() when you learn a new durable fact from tool output too (not only when the user said it).
- Use draft() when the outcome is a message to send.
- Never invent prices, URLs, or citations — only use tool output.
- If you need product options, find real products with search+fetch; max 3 options in the final result.`,
        prompt: userPrompt,
        tools: {
          search: searchTool,
          fetch: fetchTool,
          remember: rememberTool,
          save: saveTool,
          draft: draftTool,
        },
        stopWhen: stepCountIs(maxSteps),
        onStepFinish: async (event) => {
          const names =
            event.toolCalls?.map((c) =>
              'toolName' in c ? String(c.toolName) : 'tool',
            ) ?? [];
          const inputs =
            event.toolCalls?.map((c) =>
              'input' in c ? (c.input as Record<string, unknown>) : {},
            ) ?? [];
          const outputs =
            event.toolResults?.map((r) =>
              r && 'output' in r ? r.output : undefined,
            ) ?? [];
          await this.steps.insertStep({
            prepId,
            stepNumber: event.stepNumber,
            toolName: names.length ? names.join(',') : 'model',
            toolInput: inputs.length ? { calls: inputs } : { text: event.text },
            toolOutput: outputs.length ? { results: outputs } : null,
            thinking: event.text?.slice(0, 4000) ?? null,
          });
        },
      });

      const agentText = agentResult.text;

      const structured = await generateText({
        model: miniModel,
        output: Output.object({ schema: structureSchema }),
        prompt: `You format prep results for a mobile UI.

Agent output (raw):
"""
${agentText.slice(0, 24_000)}
"""

Return JSON matching the schema:
- summary: one short line for the card preview
- renderType: search | research | options | draft | compound
- result: object matching the render type:
  - search: { answer: string, sources: string[] }
  - research: { summary: string, keyPoints: string[], sources: string[] }
  - options: { options: Array<{ name, price, url, why }> } max 3 — use empty string for url or why when unknown
  - draft: { subject: string|null, body: string, tone: string } — body should read as the user; use their name and profile from context for regards/sign-off when appropriate
  - compound: { sections: Array<{ type: string, body: string }> }

Use only information from the agent output. If something is unknown, omit or use empty strings.`,
      });

      const out = structured.output;
      if (!out) {
        throw new Error('Structured output missing');
      }

      const renderType = out.renderType;
      const prepType = prepTypeFromRender(renderType);

      const now = new Date();
      await this.appendLog(prepId, 'done', 'Prep content saved', {});

      const [saved] = await this.db
        .update(prepsTable)
        .set({
          status: 'ready',
          summary: out.summary,
          result: out.result as Record<string, unknown>,
          renderType,
          prepType,
          errorMessage: null,
          readyAt: now,
        })
        .where(
          and(eq(prepsTable.id, prepId), eq(prepsTable.status, 'prepping')),
        )
        .returning();

      if (!saved) {
        this.log.log(
          `prep ${prepId} skipped marking ready (no longer prepping)`,
        );
        return;
      }

      await this.push.notifyPrepReady(saved.userId, prep.thought || prep.title);
      await this.prepEvents.publish(dumpId, {
        type: 'prep.ready',
        prep: {
          id: saved.id,
          thought: saved.thought || saved.title,
          status: saved.status,
          render_type: saved.renderType,
          summary: saved.summary,
          result: saved.result,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.error(`prep ${prepId} failed: ${msg}`);
      if (dumpId) {
        await this.failPrep(prepId, dumpId, msg);
      }
    } finally {
      if (dumpId) {
        await this.maybeEmitStreamDone(dumpId);
      }
    }
  }

  private async maybeEmitStreamDone(dumpId: string): Promise<void> {
    const left = await this.prepEvents.decrementPending(dumpId);
    if (left === null) return;
    if (left <= 0) {
      await this.prepEvents.publish(dumpId, { type: 'stream.done', dumpId });
    }
  }

  private async failPrep(
    prepId: string,
    dumpId: string,
    message: string,
  ): Promise<void> {
    await this.appendLog(prepId, 'error', message.slice(0, 500), {});
    await this.db
      .update(prepsTable)
      .set({
        status: 'failed',
        summary: 'Something went wrong',
        errorMessage: message.slice(0, 2000),
        result: { error: true, message },
      })
      .where(and(eq(prepsTable.id, prepId), eq(prepsTable.status, 'prepping')));

    const rows = await this.db
      .select()
      .from(prepsTable)
      .where(eq(prepsTable.id, prepId))
      .limit(1);
    const p = rows[0];
    if (p) {
      await this.prepEvents.publish(dumpId, {
        type: 'prep.failed',
        prep: {
          id: p.id,
          thought: p.thought || p.title,
          status: p.status,
          render_type: p.renderType,
          summary: p.summary,
          result: p.result,
        },
      });
    }
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
}
