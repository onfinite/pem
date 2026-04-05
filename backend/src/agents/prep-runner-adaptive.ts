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
  buildBusinessCardFormatterPrompt,
  buildEventsCardFormatterPrompt,
  buildFlightsCardFormatterPrompt,
  buildJobsCardFormatterPrompt,
  buildMarketCardFormatterPrompt,
  buildTrendsCardFormatterPrompt,
} from './prompts/prep-adaptive-discovery.prompt';
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
  businessCardModelSchema,
  eventsCardModelSchema,
  flightsCardModelSchema,
  jobsCardModelSchema,
  marketCardModelSchema,
  normalizeBusinessCard,
  normalizeEventsCard,
  normalizeFlightsCard,
  normalizeJobsCard,
  normalizeMarketCard,
  normalizeTrendsCard,
  trendsCardModelSchema,
} from './schemas/adaptive-prep-discovery.schema';
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
    case 'EVENTS_CARD':
    case 'FLIGHTS_CARD':
    case 'BUSINESS_CARD':
    case 'TRENDS_CARD':
    case 'MARKET_CARD':
    case 'JOBS_CARD':
      return 'research';
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
      let safeSummary = payload.summary;
      if (
        !safeSummary ||
        safeSummary.length < 8 ||
        /^[0-9]+$/.test(safeSummary)
      ) {
        const fallbackKeys = ['executiveSummary', 'topic', 'title'] as const;
        for (const k of fallbackKeys) {
          const v = (payload as Record<string, unknown>)[k];
          if (typeof v === 'string' && v.trim().length >= 12) {
            safeSummary = v.trim().slice(0, 280);
            break;
          }
        }
        if (!safeSummary || safeSummary.length < 8) {
          safeSummary = 'Your prep is ready.';
        }
      }
      await persist({
        summary: safeSummary,
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
    case 'EVENTS':
      return run(
        'EVENTS',
        eventsCardModelSchema,
        buildEventsCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeEventsCard(raw as never),
      );
    case 'FLIGHTS':
      return run(
        'FLIGHTS',
        flightsCardModelSchema,
        buildFlightsCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeFlightsCard(raw as never),
      );
    case 'BUSINESS':
      return run(
        'BUSINESS',
        businessCardModelSchema,
        buildBusinessCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeBusinessCard(raw as never),
      );
    case 'TRENDS':
      return run(
        'TRENDS',
        trendsCardModelSchema,
        buildTrendsCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeTrendsCard(raw as never),
      );
    case 'MARKET':
      return run(
        'MARKET',
        marketCardModelSchema,
        buildMarketCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeMarketCard(raw as never),
      );
    case 'JOBS':
      return run(
        'JOBS',
        jobsCardModelSchema,
        buildJobsCardFormatterPrompt(agentText, ctx),
        (raw) => normalizeJobsCard(raw as never),
      );
    default:
      return false;
  }
}
