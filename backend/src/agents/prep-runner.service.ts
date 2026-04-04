import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output, stepCountIs } from 'ai';
import { and, eq } from 'drizzle-orm';

import { createPrepAgentTools } from './agent-tools/prep-tools.factory';
import { buildPrepAgentSystemPrompt } from './prompts/prep-agent.system';
import { buildStructuredFormatterPrompt } from './prompts/prep-structured.prompt';
import { buildPrepUserPrompt } from './prompts/prep-user.prompt';
import { appendPrepAgentStep } from './prep-runner-step';
import {
  normalizeStructuredPrepOutput,
  type StructuredPrepOutput,
  structureModelSchema,
} from './schemas/prep-result.schema';
import { intentSystemAddendum } from './intents/prep-intent-routing';
import { parsePrepIntent } from './intents/prep-intent';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  dumpsTable,
  prepRunLogsTable,
  prepsTable,
  usersTable,
  type PrepRow,
  type PrepType,
} from '../database/schemas';
import type { PrimaryKind } from './schemas/prep-result.schema';
import { PrepEventsService } from '../events/prep-events.service';
import { SerpApiService } from '../integrations/serpapi.service';
import { TavilyService } from '../integrations/tavily.service';
import { ProfileService } from '../profile/profile.service';
import { PrepsService } from '../preps/preps.service';
import { PushService } from '../push/push.service';
import { StepsService } from '../steps/steps.service';
import { tryPersistAdaptiveFormat } from './prep-runner-adaptive';

/** Stored `prep_type` matches structured `primaryKind` (including `mixed`). */
function prepTypeFromPrimaryKind(pk: PrimaryKind): PrepType {
  return pk;
}

@Injectable()
export class PrepRunnerService {
  private readonly log = new Logger(PrepRunnerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly tavily: TavilyService,
    private readonly serp: SerpApiService,
    private readonly push: PushService,
    private readonly profile: ProfileService,
    private readonly preps: PrepsService,
    private readonly steps: StepsService,
    private readonly prepEvents: PrepEventsService,
  ) {}

  /**
   * @param dumpIdFromJob — from BullMQ payload when prep row is missing (e.g. deleted before run),
   *        so Redis pending count for the dump still decrements once.
   */
  async run(prepId: string, dumpIdFromJob?: string): Promise<void> {
    let dumpId: string | undefined;
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
        if (dumpIdFromJob) {
          await this.maybeEmitStreamDone(dumpIdFromJob);
        }
        return;
      }

      dumpId = row.prep.dumpId;
      const { prep, transcript } = row;
      const dumpIdStr = dumpId;

      if (prep.status !== 'prepping') {
        return;
      }

      if (prep.isBundle) {
        this.log.warn(`bundle parent prep ${prepId} skipped (legacy row)`);
        return;
      }

      await this.appendLog(prepId, 'queued', 'Prep job picked up', {});
      this.log.log(`prep ${prepId} run starting`);

      const intent = parsePrepIntent(prep.intent);

      const apiKey = this.config.get<string>('openai.apiKey');
      if (!apiKey) {
        await this.failPrep(prepId, dumpIdStr, 'OPENAI_API_KEY not configured');
        return;
      }

      if (intent === 'TRACK_MONITOR') {
        await this.appendLog(
          prepId,
          'run',
          'TRACK_MONITOR shortcut (no agent)',
          {
            intent,
          },
        );
        const shortcut: StructuredPrepOutput = {
          summary: 'Ongoing monitoring isn’t available yet',
          primaryKind: 'research',
          blocks: [
            {
              type: 'guidance',
              title: 'Coming soon',
              body: "Pem can't watch prices, listings, or the web in the background yet. For now, run a one-time search prep, or set a reminder outside Pem. We're building monitoring.",
            },
          ],
        };
        await this.persistPrepReady(prepId, dumpIdStr, prep, shortcut);
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

      const thoughtLine = prep.thought || prep.title;
      const [memorySection, pastPrepsBlock, pastDumpsBlock, profileMap] =
        await Promise.all([
          this.profile.buildMemoryPromptSection(userId),
          this.preps.relevantPastPrepsBlock(userId, thoughtLine, 5),
          this.preps.relevantPastDumpsBlock(
            userId,
            dumpIdStr,
            thoughtLine,
            transcript,
            4,
          ),
          this.profile.getProfileMap(userId),
        ]);
      const relevantBlock = [pastPrepsBlock, pastDumpsBlock]
        .filter((s) => s.trim().length > 0)
        .join('\n\n');

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

      const userPrompt = buildPrepUserPrompt({
        transcript,
        thoughtLine,
        memorySection,
        relevantBlock,
        enrichedContextJson: ctx,
      });

      await this.appendLog(prepId, 'run', 'Starting agent loop', {
        model: agentModelId,
      });

      const tools = createPrepAgentTools({
        tavily: this.tavily,
        serp: this.serp,
        profile: this.profile,
        userId,
        prepId,
        dumpId: dumpIdStr,
        agentModel,
        userPrompt,
        displayName,
        intent,
      });

      const system = buildPrepAgentSystemPrompt(
        memorySection,
        relevantBlock,
        intentSystemAddendum(intent),
      );

      const agentTimeoutMs =
        this.config.get<number>('prepAgentTimeoutMs') ?? 600_000;
      const structureTimeoutMs =
        this.config.get<number>('prepStructureTimeoutMs') ?? 120_000;

      const agentResult = await generateText({
        model: agentModel,
        system,
        prompt: userPrompt,
        tools,
        stopWhen: stepCountIs(maxSteps),
        onStepFinish: (event) => appendPrepAgentStep(prepId, this.steps, event),
        timeout: agentTimeoutMs,
      });

      const agentText = agentResult.text;
      const structuredFormatterCtx = {
        memorySection,
        thoughtLine,
        relevantContextSection: relevantBlock,
      };

      const adaptiveDone = await tryPersistAdaptiveFormat({
        intent,
        agentText,
        ctx: structuredFormatterCtx,
        miniModel,
        structureTimeoutMs,
        log: this.log,
        persist: async (p) => {
          await this.persistReadyResult(prepId, dumpIdStr, prep, p);
        },
      });
      if (adaptiveDone) {
        return;
      }

      const structured = await generateText({
        model: miniModel,
        output: Output.object({ schema: structureModelSchema }),
        prompt: buildStructuredFormatterPrompt(
          agentText,
          structuredFormatterCtx,
        ),
        timeout: structureTimeoutMs,
      });

      const rawStructured = structured.output;
      if (!rawStructured) {
        throw new Error('Structured output missing');
      }

      const out = normalizeStructuredPrepOutput(rawStructured);

      await this.persistPrepReady(prepId, dumpIdStr, prep, out);
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

  private async persistPrepReady(
    prepId: string,
    dumpId: string,
    prep: PrepRow,
    out: StructuredPrepOutput,
  ): Promise<void> {
    const result: Record<string, unknown> = {
      blocks: out.blocks,
      primaryKind: out.primaryKind,
    };
    await this.persistReadyResult(prepId, dumpId, prep, {
      summary: out.summary,
      prepType: prepTypeFromPrimaryKind(out.primaryKind),
      result,
      logMeta: { primaryKind: out.primaryKind },
    });
  }

  /** Persists ready prep + SSE + push (shared by composable blocks and adaptive card payloads). */
  private async persistReadyResult(
    prepId: string,
    dumpId: string,
    prep: PrepRow,
    params: {
      summary: string;
      prepType: PrepType;
      result: Record<string, unknown>;
      logMeta?: Record<string, unknown>;
    },
  ): Promise<void> {
    const now = new Date();
    const { summary, prepType, result, logMeta } = params;

    const [updated] = await this.db
      .update(prepsTable)
      .set({
        status: 'ready',
        summary,
        prepType,
        result,
        readyAt: now,
        errorMessage: null,
      })
      .where(and(eq(prepsTable.id, prepId), eq(prepsTable.status, 'prepping')))
      .returning();

    if (!updated) {
      this.log.warn(
        `persistReadyResult: prep ${prepId} not updated (not prepping?)`,
      );
      return;
    }

    await this.appendLog(prepId, 'run', 'Prep ready', logMeta ?? {});

    await this.prepEvents.publish(dumpId, {
      type: 'prep.ready',
      prep: {
        id: updated.id,
        thought: updated.thought || updated.title,
        intent: updated.intent ?? null,
        status: updated.status,
        prep_type: updated.prepType,
        summary: updated.summary,
        result: updated.result,
        created_at: updated.createdAt.toISOString(),
      },
    });

    if (!updated.parentPrepId) {
      await this.push.notifyPrepReady(
        updated.userId,
        prep.thought || prep.title,
      );
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
    internalMessage: string,
  ): Promise<void> {
    await this.appendLog(prepId, 'error', internalMessage.slice(0, 500), {});
    await this.db
      .update(prepsTable)
      .set({
        status: 'failed',
        summary: 'Something went wrong. Tap to retry.',
        errorMessage: null,
        result: { error: true },
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
          intent: p.intent ?? null,
          status: p.status,
          prep_type: p.prepType,
          summary: p.summary,
          result: p.result,
          created_at: p.createdAt.toISOString(),
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
