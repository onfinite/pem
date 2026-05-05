import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { logWithContext } from '@/core/utils/format-log-context';

const RECALL_GATE =
  /\b(remember|recall|remind\s+me|what\s+did\s+we|talk\s+about|trip|vacation|last\s+(month|year|week|summer|spring|fall|winter)|yesterday)\b/i;

const recallPlanSchema = z.object({
  recall_kind: z.enum([
    'episodic_topic',
    'list_status',
    'calendar',
    'photo_lookup',
    'mixed',
    'none',
  ]),
  embedding_search_text: z
    .string()
    .describe(
      'Short search query for vector RAG: entities + topic, not the full user message.',
    ),
  wants_past_photos: z.boolean(),
});

export type RecallQueryPlan = z.infer<typeof recallPlanSchema>;

@Injectable()
export class RecallQueryPlannerLlmService {
  private readonly log = new Logger(RecallQueryPlannerLlmService.name);

  constructor(private readonly config: ConfigService) {}

  shouldPlan(userText: string): boolean {
    const t = userText.trim();
    return t.length >= 8 && t.length < 400 && RECALL_GATE.test(t);
  }

  async plan(userText: string): Promise<RecallQueryPlan | null> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return null;

    const openai = createOpenAI({ apiKey });
    try {
      const result = await generateText({
        model: openai('gpt-4o-mini'),
        output: Output.object({
          name: 'recall_query_plan',
          description: 'Vague recall intent and embedding query',
          schema: recallPlanSchema,
        }),
        prompt: `Classify recall intent and produce a tight embedding search string for chat history RAG.

User message:
"""${userText.slice(0, 800)}"""

Rules:
- recall_kind episodic_topic when they ask what happened, memories, trips, past conversations.
- embedding_search_text: 12–80 chars, concrete nouns + topic (e.g. "LA trip flights hotel"), no quotes.
- wants_past_photos true if photos/screenshots likely help (trips, receipts, people, places) even if they did not say "photo".`,
      });
      return result.output ?? null;
    } catch (e) {
      this.log.warn(
        logWithContext('Recall query planner failed', {
          scope: 'recall_query_planner',
          err: e instanceof Error ? e.message : String(e),
        }),
      );
      return null;
    }
  }
}
