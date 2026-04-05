import { Logger } from '@nestjs/common';
import { generateText, Output } from 'ai';
import type { LanguageModel } from 'ai';
import { z } from 'zod';

import type { PrepType } from '../database/schemas';
import type { CompositeLaneResult } from './prep-runner-composite-fanout';
import type { AdaptivePersistFn } from './prep-runner-adaptive';

export type CompositePersistParams = Parameters<AdaptivePersistFn>[0] & {
  isComposite?: boolean;
  displayEmoji?: string | null;
};

const synthesisSchema = z.object({
  title: z
    .string()
    .describe('Short human title for the brief, e.g. "Fremont move plan"'),
  emoji: z.string().describe('One relevant emoji'),
  overview_teaser: z
    .string()
    .min(20)
    .describe('One sentence summary of what Pem found overall'),
  verdict: z
    .string()
    .describe('Direct recommendation — commit like a friend who did the work'),
  reasons: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe('2–4 reasons supporting the verdict'),
  nextAction: z
    .string()
    .describe('One concrete next step the user should take'),
  caveat: z.string().describe('One caveat or limitation — "" if none'),
});

/**
 * Assemble composite brief from structured lane results.
 * One small LLM call synthesizes OVERVIEW + PEM_RECOMMENDATION from the card data.
 * No lossy text→JSON formatter — card data goes straight from agents to DB.
 */
export async function assembleAndPersistComposite(params: {
  laneResults: CompositeLaneResult[];
  thoughtLine: string;
  miniModel: LanguageModel;
  timeoutMs: number;
  persist: (p: CompositePersistParams) => Promise<void>;
  log: Logger;
  prepId?: string;
}): Promise<boolean> {
  const {
    laneResults,
    thoughtLine,
    miniModel,
    timeoutMs,
    persist,
    log,
    prepId,
  } = params;

  const pf = prepId
    ? `[composite-assemble prep=${prepId}]`
    : '[composite-assemble]';

  const okSections = laneResults.filter(
    (r) => r.ok && Object.keys(r.data).length > 0,
  );
  if (okSections.length === 0) {
    log.warn(`${pf} no successful lane results — cannot assemble composite`);
    return false;
  }

  log.log(`${pf} assembling ${okSections.length} card sections from lanes`);

  const cardSections = okSections.map((lane) => ({
    type: lane.id,
    title: lane.title,
    emoji: lane.emoji,
    card_schema: lane.cardSchema,
    data: lane.data,
    agent_note: lane.agentNote.trim() || null,
    evidence_snippets: null as string[] | null,
  }));

  let title = thoughtLine.trim().slice(0, 80);
  let emoji = '📋';
  let overviewTeaser = `Here's what Pem found for: ${thoughtLine.trim().slice(0, 120)}`;
  let verdict = 'Review the sections above and pick what works best.';
  let reasons = ['Research completed across multiple areas.'];
  let nextAction = 'Open each section and review the details.';
  let caveat = '';

  try {
    const dataSummary = okSections
      .map((s) => {
        const d = s.data;
        const count =
          (Array.isArray(d.businesses) ? d.businesses.length : 0) +
          (Array.isArray(d.places) ? d.places.length : 0) +
          (Array.isArray(d.offers) ? d.offers.length : 0) +
          (Array.isArray(d.products) ? d.products.length : 0) +
          (Array.isArray(d.events) ? d.events.length : 0) +
          (Array.isArray(d.jobs) ? d.jobs.length : 0);
        const summaryText =
          typeof d.summary === 'string' ? d.summary.slice(0, 200) : '';
        const recText =
          typeof d.recommendation === 'string'
            ? d.recommendation.slice(0, 200)
            : '';
        return `- ${s.title} (${s.cardSchema}, ${count} items): ${summaryText || recText || '(no summary)'}`;
      })
      .join('\n');

    log.log(`${pf} synthesizing OVERVIEW + PEM_RECOMMENDATION`);

    const synthesis = await generateText({
      model: miniModel,
      output: Output.object({ schema: synthesisSchema }),
      prompt: `You write the overview and recommendation for a Pem composite brief.

The user asked: "${thoughtLine.trim().slice(0, 500)}"

The research agents found:
${dataSummary}

Write:
- **title**: short human title (e.g. "Fremont move plan", "Wedding vendor brief")
- **emoji**: one relevant emoji
- **overview_teaser**: one warm sentence summarizing what was found (≥20 chars)
- **verdict**: direct recommendation — specific, not generic
- **reasons**: 2–4 short reasons
- **nextAction**: one concrete next step
- **caveat**: one limitation or "" if none

Be specific. Reference what the agents actually found. No filler.`,
      timeout: timeoutMs,
    });

    const out = synthesis.output;
    if (out) {
      title = out.title.trim() || title;
      emoji = out.emoji.trim() || emoji;
      overviewTeaser = out.overview_teaser.trim() || overviewTeaser;
      verdict = out.verdict.trim() || verdict;
      reasons =
        out.reasons.filter((r) => r.trim().length > 0).length > 0
          ? out.reasons.filter((r) => r.trim().length > 0)
          : reasons;
      nextAction = out.nextAction.trim() || nextAction;
      caveat = out.caveat.trim() || '';
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.warn(`${pf} synthesis LLM failed, using fallback: ${msg}`);
  }

  const overviewSection = {
    type: 'OVERVIEW',
    title: 'Overview',
    emoji: '📋',
    card_schema: null as string | null,
    data: { summary: overviewTeaser },
    agent_note: null as string | null,
    evidence_snippets: null as string[] | null,
  };

  const pemSection = {
    type: 'PEM_RECOMMENDATION',
    title: 'Pem\u2019s recommendation',
    emoji: '✅',
    card_schema: null as string | null,
    data: {
      verdict,
      reasons,
      nextAction,
      ...(caveat ? { caveat } : {}),
      methodology: `Based on ${okSections.length} parallel research lanes with live tool data.`,
    },
    agent_note: null as string | null,
    evidence_snippets: null as string[] | null,
  };

  const allSections = [overviewSection, ...cardSections, pemSection];

  const sourcesUsed = [
    ...new Set(
      okSections.flatMap((s) => {
        const sources: string[] = [];
        const d = s.data;
        if (d.businesses || d.places) sources.push('google_local');
        if (d.offers) sources.push('google_flights');
        if (d.products) sources.push('google_shopping');
        if (d.events) sources.push('google_events');
        if (d.jobs) sources.push('google_jobs');
        sources.push('tavily');
        return sources;
      }),
    ),
  ];

  const compositeBrief = {
    schema: 'COMPOSITE_BRIEF' as const,
    is_composite: true as const,
    title,
    emoji,
    overview_teaser: overviewTeaser,
    sections: allSections,
    sources_used: sourcesUsed,
    confidence:
      okSections.length >= 2 ? ('high' as const) : ('medium' as const),
    generated_at: new Date().toISOString(),
  };

  const summary =
    overviewTeaser.slice(0, 280) ||
    title.slice(0, 280) ||
    'Your prep brief is ready.';

  log.log(
    `${pf} SUCCESS — persisting COMPOSITE_BRIEF title="${title.slice(0, 60)}" sections=${allSections.length} cardSections=${cardSections.length}`,
  );

  await persist({
    summary,
    prepType: 'mixed' satisfies PrepType,
    result: compositeBrief as unknown as Record<string, unknown>,
    logMeta: {
      schema: 'COMPOSITE_BRIEF',
      confidence: compositeBrief.confidence,
      sectionCount: allSections.length,
      cardSections: cardSections.length,
    },
    isComposite: true,
    displayEmoji: emoji || null,
  });

  return true;
}
