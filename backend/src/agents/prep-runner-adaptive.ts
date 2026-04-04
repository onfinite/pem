import { Logger } from '@nestjs/common';
import { generateText, Output } from 'ai';
import type { LanguageModel } from 'ai';
import type { z } from 'zod';

import type { PrepType } from '../database/schemas';
import {
  buildDraftCardFormatterPrompt,
  buildPlaceCardFormatterPrompt,
  buildShoppingCardFormatterPrompt,
} from './prompts/prep-adaptive.prompt';
import {
  buildComparisonCardFormatterPrompt,
  buildDecisionCardFormatterPrompt,
  buildExplainCardFormatterPrompt,
  buildIdeaCardsFormatterPrompt,
  buildLegalFinancialCardFormatterPrompt,
  buildMeetingBriefFormatterPrompt,
  buildPersonCardFormatterPrompt,
  buildResearchCardFormatterPrompt,
  buildSummaryCardFormatterPrompt,
} from './prompts/prep-adaptive-extra.prompt';
import type { StructuredFormatterContext } from './prompts/prep-structured.prompt';
import {
  draftCardModelSchema,
  normalizeDraftCard,
  normalizePlaceCard,
  normalizeShoppingCard,
  placeCardModelSchema,
  shoppingCardModelSchema,
} from './schemas/adaptive-prep.schema';
import {
  comparisonCardModelSchema,
  decisionCardModelSchema,
  explainCardModelSchema,
  ideaCardsModelSchema,
  legalFinancialCardModelSchema,
  meetingBriefModelSchema,
  normalizeComparisonCard,
  normalizeDecisionCard,
  normalizeExplainCard,
  normalizeIdeaCards,
  normalizeLegalFinancialCard,
  normalizeMeetingBrief,
  normalizePersonCard,
  normalizeResearchCard,
  normalizeSummaryCard,
  personCardModelSchema,
  researchCardModelSchema,
  summaryCardModelSchema,
} from './schemas/adaptive-prep-extended.schema';
import type { PrepIntent } from './intents/prep-intent';

function prepTypeForSchema(schema: string): PrepType {
  switch (schema) {
    case 'SHOPPING_CARD':
    case 'COMPARISON_CARD':
    case 'IDEA_CARDS':
      return 'options';
    case 'DRAFT_CARD':
      return 'draft';
    case 'PLACE_CARD':
    case 'PERSON_CARD':
    case 'EXPLAIN_CARD':
      return 'search';
    default:
      return 'research';
  }
}

export type AdaptivePersistFn = (params: {
  summary: string;
  prepType: PrepType;
  result: Record<string, unknown>;
  logMeta?: Record<string, unknown>;
}) => Promise<void>;

/**
 * Intent-specific adaptive JSON formatters after the tool loop.
 * Returns true if a card was persisted (caller should skip generic structured output).
 */
export async function tryPersistAdaptiveFormat(params: {
  intent: PrepIntent;
  agentText: string;
  ctx: StructuredFormatterContext;
  miniModel: LanguageModel;
  structureTimeoutMs: number;
  persist: AdaptivePersistFn;
  log: Logger;
}): Promise<boolean> {
  const {
    intent,
    agentText,
    ctx,
    miniModel,
    structureTimeoutMs,
    persist,
    log,
  } = params;

  const run = async <T>(
    schemaLabel: string,
    zodSchema: z.ZodType<unknown>,
    prompt: string,
    normalize: (
      raw: T,
    ) => { schema: string; summary: string } & Record<string, unknown>,
  ): Promise<boolean> => {
    try {
      const adaptive = await generateText({
        model: miniModel,
        output: Output.object({ schema: zodSchema }),
        prompt,
        timeout: structureTimeoutMs,
      });
      if (!adaptive.output) return false;
      const payload = normalize(adaptive.output as T);
      const disc = payload.schema;
      await persist({
        summary: payload.summary,
        prepType: prepTypeForSchema(disc),
        result: { ...payload } as Record<string, unknown>,
        logMeta: { schema: disc },
      });
      return true;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`adaptive ${schemaLabel} formatter failed, fallback: ${msg}`);
      return false;
    }
  };

  switch (intent) {
    case 'SHOPPING':
      return run(
        'SHOPPING',
        shoppingCardModelSchema,
        buildShoppingCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeShoppingCard(raw as never),
      );
    case 'DRAFT':
    case 'TRANSLATE_SIMPLIFY':
      return run(
        'DRAFT',
        draftCardModelSchema,
        buildDraftCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeDraftCard(raw as never),
      );
    case 'FIND_PLACE':
      return run(
        'PLACE',
        placeCardModelSchema,
        buildPlaceCardFormatterPrompt(agentText, ctx),
        (raw) => normalizePlaceCard(raw as never),
      );
    case 'COMPARISON':
      return run(
        'COMPARISON',
        comparisonCardModelSchema,
        buildComparisonCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeComparisonCard(raw as never),
      );
    case 'RESEARCH':
    case 'LIFE_ADMIN':
      return run(
        'RESEARCH',
        researchCardModelSchema,
        buildResearchCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeResearchCard(raw as never),
      );
    case 'FIND_PERSON':
      return run(
        'PERSON',
        personCardModelSchema,
        buildPersonCardFormatterPrompt(agentText, ctx),
        (raw) => normalizePersonCard(raw as never),
      );
    case 'SCHEDULE_PREP':
      return run(
        'MEETING',
        meetingBriefModelSchema,
        buildMeetingBriefFormatterPrompt(agentText, ctx),
        (raw) => normalizeMeetingBrief(raw as never),
      );
    case 'DECISION':
      return run(
        'DECISION',
        decisionCardModelSchema,
        buildDecisionCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeDecisionCard(raw as never),
      );
    case 'LEGAL_FINANCIAL':
      return run(
        'LEGAL',
        legalFinancialCardModelSchema,
        buildLegalFinancialCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeLegalFinancialCard(raw as never),
      );
    case 'EXPLAIN':
      return run(
        'EXPLAIN',
        explainCardModelSchema,
        buildExplainCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeExplainCard(raw as never),
      );
    case 'SUMMARIZE':
      return run(
        'SUMMARY',
        summaryCardModelSchema,
        buildSummaryCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeSummaryCard(raw as never),
      );
    case 'CONTENT_IDEA':
      return run(
        'IDEA',
        ideaCardsModelSchema,
        buildIdeaCardsFormatterPrompt(agentText, ctx),
        (raw) => normalizeIdeaCards(raw as never),
      );
    default:
      return false;
  }
}
