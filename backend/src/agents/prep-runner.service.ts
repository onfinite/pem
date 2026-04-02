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
import { structureSchema } from './schemas/prep-result.schema';

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
import { PrepsService } from '../preps/preps.service';
import { PushService } from '../push/push.service';
import { StepsService } from '../steps/steps.service';

function prepTypeFromRender(r: PrepRenderType): PrepType {
  if (r === 'compound') return 'research';
  return r;
}

@Injectable()
export class PrepRunnerService {
  private readonly log = new Logger(PrepRunnerService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly tavily: TavilyService,
    private readonly push: PushService,
    private readonly profile: ProfileService,
    private readonly preps: PrepsService,
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

      const [memorySection, relevantBlock, profileMap] = await Promise.all([
        this.profile.buildMemoryPromptSection(userId),
        this.preps.relevantPastPrepsBlock(
          userId,
          prep.thought || prep.title,
          5,
        ),
        this.profile.getProfileMap(userId),
      ]);

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
        thoughtLine: prep.thought || prep.title,
        memorySection,
        relevantBlock,
        enrichedContextJson: ctx,
      });

      await this.appendLog(prepId, 'run', 'Starting agent loop', {
        model: agentModelId,
      });

      const tools = createPrepAgentTools({
        tavily: this.tavily,
        profile: this.profile,
        userId,
        prepId,
        dumpId,
        agentModel,
        userPrompt,
        displayName,
      });

      const system = buildPrepAgentSystemPrompt(memorySection, relevantBlock);

      const agentResult = await generateText({
        model: agentModel,
        system,
        prompt: userPrompt,
        tools,
        stopWhen: stepCountIs(maxSteps),
        onStepFinish: (event) => appendPrepAgentStep(prepId, this.steps, event),
      });

      const agentText = agentResult.text;

      const structured = await generateText({
        model: miniModel,
        output: Output.object({ schema: structureSchema }),
        prompt: buildStructuredFormatterPrompt(agentText),
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
          created_at: saved.createdAt.toISOString(),
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
          status: p.status,
          render_type: p.renderType,
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
