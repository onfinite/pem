import { Logger } from '@nestjs/common';
import { generateText, Output, stepCountIs, type LanguageModel } from 'ai';
import { z } from 'zod';

import { createPrepAgentTools } from './agent-tools/prep-tools.factory';
import { buildCompositePrepAgentAddendum } from './prompts/prep-composite.prompt';
import { buildPrepAgentSystemPrompt } from './prompts/prep-agent.system';
import { appendPrepAgentStep } from './prep-runner-step';
import type { StepsService } from '../steps/steps.service';

import {
  businessCardModelSchema,
  eventsCardModelSchema,
  flightsCardModelSchema,
  jobsCardModelSchema,
  normalizeBusinessCard,
  normalizeEventsCard,
  normalizeFlightsCard,
  normalizeJobsCard,
} from './schemas/adaptive-prep-discovery.schema';
import {
  draftCardModelSchema,
  normalizeDraftCard,
  normalizeShoppingCard,
  shoppingCardModelSchema,
  placeCardModelSchema,
  normalizePlaceCard,
} from './schemas/adaptive-prep.schema';

export type CardSchemaKey =
  | 'BUSINESS_CARD'
  | 'PLACE_CARD'
  | 'FLIGHTS_CARD'
  | 'SHOPPING_CARD'
  | 'EVENTS_CARD'
  | 'JOBS_CARD'
  | 'DRAFT_CARD';

const VALID_CARD_SCHEMAS: CardSchemaKey[] = [
  'BUSINESS_CARD',
  'PLACE_CARD',
  'FLIGHTS_CARD',
  'SHOPPING_CARD',
  'EVENTS_CARD',
  'JOBS_CARD',
  'DRAFT_CARD',
];

/**
 * Run one lane sub-agent with the correct card schema.
 * Each branch calls generateText with the specific Zod schema — avoids union type issues.
 */
async function runLaneWithSchema(
  cardSchema: CardSchemaKey,
  genParams: {
    model: LanguageModel;
    system: string;
    prompt: string;
    tools: ReturnType<typeof createPrepAgentTools>;
    maxSteps: number;
    onStepFinish: (event: {
      text?: string;
      toolCalls?: unknown;
      toolResults?: unknown;
    }) => Promise<void>;
    timeout: number;
  },
): Promise<{ data: Record<string, unknown>; text: string } | null> {
  const { model, system, prompt, tools, maxSteps, onStepFinish, timeout } =
    genParams;

  switch (cardSchema) {
    case 'BUSINESS_CARD': {
      const r = await generateText({
        model,
        system,
        prompt,
        tools,
        timeout,
        output: Output.object({ schema: businessCardModelSchema }),
        stopWhen: stepCountIs(maxSteps),
        onStepFinish,
      });
      return r.output
        ? {
            data: normalizeBusinessCard(r.output) as unknown as Record<
              string,
              unknown
            >,
            text: r.text,
          }
        : null;
    }
    case 'PLACE_CARD': {
      const r = await generateText({
        model,
        system,
        prompt,
        tools,
        timeout,
        output: Output.object({ schema: placeCardModelSchema }),
        stopWhen: stepCountIs(maxSteps),
        onStepFinish,
      });
      return r.output
        ? {
            data: normalizePlaceCard(r.output) as unknown as Record<
              string,
              unknown
            >,
            text: r.text,
          }
        : null;
    }
    case 'FLIGHTS_CARD': {
      const r = await generateText({
        model,
        system,
        prompt,
        tools,
        timeout,
        output: Output.object({ schema: flightsCardModelSchema }),
        stopWhen: stepCountIs(maxSteps),
        onStepFinish,
      });
      return r.output
        ? {
            data: normalizeFlightsCard(r.output) as unknown as Record<
              string,
              unknown
            >,
            text: r.text,
          }
        : null;
    }
    case 'SHOPPING_CARD': {
      const r = await generateText({
        model,
        system,
        prompt,
        tools,
        timeout,
        output: Output.object({ schema: shoppingCardModelSchema }),
        stopWhen: stepCountIs(maxSteps),
        onStepFinish,
      });
      return r.output
        ? {
            data: normalizeShoppingCard(r.output) as unknown as Record<
              string,
              unknown
            >,
            text: r.text,
          }
        : null;
    }
    case 'EVENTS_CARD': {
      const r = await generateText({
        model,
        system,
        prompt,
        tools,
        timeout,
        output: Output.object({ schema: eventsCardModelSchema }),
        stopWhen: stepCountIs(maxSteps),
        onStepFinish,
      });
      return r.output
        ? {
            data: normalizeEventsCard(r.output) as unknown as Record<
              string,
              unknown
            >,
            text: r.text,
          }
        : null;
    }
    case 'JOBS_CARD': {
      const r = await generateText({
        model,
        system,
        prompt,
        tools,
        timeout,
        output: Output.object({ schema: jobsCardModelSchema }),
        stopWhen: stepCountIs(maxSteps),
        onStepFinish,
      });
      return r.output
        ? {
            data: normalizeJobsCard(r.output) as unknown as Record<
              string,
              unknown
            >,
            text: r.text,
          }
        : null;
    }
    case 'DRAFT_CARD': {
      const r = await generateText({
        model,
        system,
        prompt,
        tools,
        timeout,
        output: Output.object({ schema: draftCardModelSchema }),
        stopWhen: stepCountIs(maxSteps),
        onStepFinish,
      });
      return r.output
        ? {
            data: normalizeDraftCard(r.output) as unknown as Record<
              string,
              unknown
            >,
            text: r.text,
          }
        : null;
    }
  }
}

/** One parallel sub-agent lane with its target card schema. */
export type CompositeLanePlan = {
  id: string;
  focus: string;
  cardSchema: CardSchemaKey;
  /** Display title for this section in the composite brief. */
  title: string;
  emoji: string;
};

/** Result of one lane — typed card data ready for the composite brief. */
export type CompositeLaneResult = {
  id: string;
  cardSchema: CardSchemaKey;
  title: string;
  emoji: string;
  /** Normalized card payload (includes `schema` field). */
  data: Record<string, unknown>;
  /** Free-text agent note from the lane. */
  agentNote: string;
  ok: boolean;
};

const lanePlanSchema = z.object({
  lanes: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .max(64)
          .describe('UPPER_SNAKE id, e.g. FLIGHTS, MOVERS, PRODUCTS'),
        focus: z
          .string()
          .min(8)
          .max(900)
          .describe('What this sub-agent should research'),
        cardSchema: z
          .string()
          .describe(`Target card type: ${VALID_CARD_SCHEMAS.join(', ')}`),
        title: z
          .string()
          .min(1)
          .max(80)
          .describe('Display title for this section'),
        emoji: z.string().min(1).max(4).describe('One emoji for this section'),
      }),
    )
    .min(2)
    .max(4),
});

function defaultLanes(thoughtLine: string): CompositeLanePlan[] {
  const t = thoughtLine.trim().slice(0, 500);
  return [
    {
      id: 'PRIMARY_RESEARCH',
      focus: `Find businesses, services, or places relevant to: ${t}. Use google(local) or search().`,
      cardSchema: 'BUSINESS_CARD',
      title: 'Top picks',
      emoji: '🏢',
    },
    {
      id: 'ALTERNATIVES',
      focus:
        'Find alternative products, options, or comparisons with prices. Use google(shopping) or search().',
      cardSchema: 'SHOPPING_CARD',
      title: 'Options & pricing',
      emoji: '🛒',
    },
  ];
}

function clampLanes(
  raw: z.infer<typeof lanePlanSchema>['lanes'],
  maxLanes: number,
  thoughtLine: string,
): CompositeLanePlan[] {
  const validated: CompositeLanePlan[] = [];
  for (const lane of raw.slice(0, Math.min(maxLanes, 4))) {
    const cs = lane.cardSchema;
    if (VALID_CARD_SCHEMAS.includes(cs as CardSchemaKey)) {
      validated.push({
        id: lane.id,
        focus: lane.focus,
        cardSchema: cs as CardSchemaKey,
        title: lane.title,
        emoji: lane.emoji,
      });
    }
  }
  return validated.length >= 2 ? validated : defaultLanes(thoughtLine);
}

/**
 * Mini-model plan: split composite work into 2–4 parallel lanes,
 * each targeting a specific card schema.
 */
export async function planCompositeLanes(params: {
  thoughtLine: string;
  transcript: string;
  miniModel: LanguageModel;
  timeoutMs: number;
  maxLanes: number;
  log: Logger;
}): Promise<CompositeLanePlan[]> {
  const { thoughtLine, miniModel, timeoutMs, maxLanes, log } = params;
  const thought = thoughtLine.trim().slice(0, 2_000);
  try {
    const result = await generateText({
      model: miniModel,
      output: Output.object({ schema: lanePlanSchema }),
      prompt: `You split one Pem composite prep into **parallel research lanes**. Each lane is handled by a **separate sub-agent** with tools (search, google). Each lane produces a **specific card type** for the app.

**IMPORTANT:** Only plan lanes for the SINGLE thought below. The user's dump may have contained other unrelated thoughts — those are handled by separate preps. Do NOT create lanes for anything outside this thought.

Available card types (pick the best fit for each lane):
- **BUSINESS_CARD** — businesses, services, vendors, movers, restaurants, clinics, stores (name, rating, address, phone, website)
- **PLACE_CARD** — geographic places, hotels, parks, landmarks, neighborhoods (name, address, lat/lng, price range)
- **FLIGHTS_CARD** — flight options (airline, price, duration, stops, booking URL)
- **SHOPPING_CARD** — products, purchases, gift ideas (name, price, rating, store, pros/cons)
- **EVENTS_CARD** — events, concerts, festivals, meetups (title, date, venue, tickets)
- **JOBS_CARD** — job listings, career opportunities (title, company, salary, link)
- **DRAFT_CARD** — emails, messages, letters to write (subject, body, tone)

Rules:
- 2–4 lanes. Each lane targets a **different** card type (no duplicates unless truly needed).
- **id**: short UPPER_SNAKE (e.g. MOVERS, FLIGHTS, PRODUCTS).
- **focus**: clear instructions — what to find, which tools to use.
- **cardSchema**: one of the card types above.
- **title**: short display title (e.g. "Moving services", "Flight deals").
- **emoji**: one relevant emoji.
- Think about what the user needs for THIS thought only. A move needs BUSINESS_CARD (movers) + PLACE_CARD (housing). A wedding needs BUSINESS_CARD (vendors) + EVENTS_CARD (venues). A trip needs FLIGHTS_CARD + PLACE_CARD (hotels).

Thought to plan:
"""
${thought}
"""

Return JSON only.`,
      timeout: timeoutMs,
    });
    const out = result.output;
    if (!out?.lanes?.length) {
      log.warn('composite fan-out plan: empty output, using default lanes');
      return clampLanes([], maxLanes, thoughtLine);
    }
    return clampLanes(out.lanes, maxLanes, thoughtLine);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`composite fan-out plan failed (${msg}), using default lanes`);
    return defaultLanes(thoughtLine);
  }
}

function buildLaneAddendum(lane: CompositeLanePlan): string {
  return `

## Parallel lane (this sub-agent only)

You are **one** of several agents running **in parallel**. Other agents cover other parts of this prep.

- **Lane id:** ${lane.id}
- **Your focus:** ${lane.focus}
- **Output format:** Your final output will be structured as a **${lane.cardSchema}**. Use tools to find real data (names, prices, ratings, URLs) — the structured schema will capture it automatically.

**Rules:** Go deep on this lane only. Call google() or search() at least once. Find real named entities with concrete details from tools.

**CRITICAL:** The dump transcript may contain MULTIPLE unrelated thoughts (e.g. moving + birthday gift). Those other thoughts are handled by separate preps. You must ONLY research what is described in "Thought to prep (this card)" — ignore everything else in the transcript.`;
}

/**
 * Run each lane as a sub-agent with tools AND structured output.
 * Each lane returns typed card data directly — no formatter needed.
 */
export async function runCompositeFanout(params: {
  lanes: CompositeLanePlan[];
  agentModel: LanguageModel;
  userPrompt: string;
  memorySection: string;
  relevantBlock: string;
  tools: ReturnType<typeof createPrepAgentTools>;
  maxStepsPerLane: number;
  prepId: string;
  steps: StepsService;
  agentTimeoutMs: number;
  log: Logger;
}): Promise<{ sections: CompositeLaneResult[]; laneIds: string[] }> {
  const {
    lanes,
    agentModel,
    userPrompt,
    memorySection,
    relevantBlock,
    tools,
    maxStepsPerLane,
    prepId,
    steps,
    agentTimeoutMs,
    log,
  } = params;

  let stepSeq = 1;
  const appendLaneStep = async (
    laneId: string,
    event: {
      text?: string;
      toolCalls?: unknown;
      toolResults?: unknown;
    },
  ) => {
    const n = stepSeq++;
    const text = event.text?.length
      ? `[lane:${laneId}] ${event.text}`
      : `[lane:${laneId}]`;
    await appendPrepAgentStep(prepId, steps, {
      stepNumber: n,
      text,
      toolCalls: event.toolCalls,
      toolResults: event.toolResults,
    });
  };

  const runners = lanes.map((lane) =>
    (async (): Promise<CompositeLaneResult> => {
      const system = buildPrepAgentSystemPrompt(
        memorySection,
        relevantBlock,
        `${buildCompositePrepAgentAddendum()}${buildLaneAddendum(lane)}`,
      );
      try {
        const laneResult = await runLaneWithSchema(lane.cardSchema, {
          model: agentModel,
          system,
          prompt: userPrompt,
          tools,
          maxSteps: maxStepsPerLane,
          onStepFinish: async (event) => {
            await appendLaneStep(lane.id, event);
          },
          timeout: agentTimeoutMs,
        });

        if (!laneResult) {
          log.warn(`lane ${lane.id}: no structured output`);
          return {
            id: lane.id,
            cardSchema: lane.cardSchema,
            title: lane.title,
            emoji: lane.emoji,
            data: {},
            agentNote: '',
            ok: false,
          };
        }

        log.log(
          `lane ${lane.id} (${lane.cardSchema}): OK — ${JSON.stringify(laneResult.data).length} chars`,
        );

        return {
          id: lane.id,
          cardSchema: lane.cardSchema,
          title: lane.title,
          emoji: lane.emoji,
          data: laneResult.data,
          agentNote: laneResult.text.slice(0, 500) || '',
          ok: true,
        };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        log.warn(`composite fan-out lane ${lane.id} failed: ${msg}`);
        return {
          id: lane.id,
          cardSchema: lane.cardSchema,
          title: lane.title,
          emoji: lane.emoji,
          data: {},
          agentNote: `Lane failed: ${msg}`,
          ok: false,
        };
      }
    })(),
  );

  const settled = await Promise.all(runners);

  for (const r of settled) {
    const status = r.ok ? 'OK' : 'FAILED';
    log.log(`composite lane ${r.id} (${r.cardSchema}): ${status}`);
  }

  return {
    sections: settled,
    laneIds: settled.map((r) => r.id),
  };
}
