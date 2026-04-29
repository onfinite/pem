import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import type { MessageLinkContentType } from '@/database/schemas/index';
import { coerceLinkContentType } from '@/modules/chat/prompts/classify-link-content.prompt';

const linkClassificationSchema = z.object({
  content_type: z
    .enum([
      'product',
      'article',
      'job',
      'recipe',
      'restaurant',
      'video',
      'social',
      'general',
    ])
    .describe('Page category'),
  structured_summary: z
    .string()
    .max(2000)
    .describe('2-3 sentences for the assistant'),
  extracted_metadata: z
    .record(z.string(), z.unknown())
    .describe('Type-specific fields'),
});

export type LinkClassification = {
  content_type: MessageLinkContentType;
  structured_summary: string;
  extracted_metadata: Record<string, unknown>;
};

export async function classifyLinkContentWithLlm(params: {
  apiKey: string;
  modelId: string;
  prompt: string;
}): Promise<LinkClassification> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const result = await generateText({
    model: openai(params.modelId),
    output: Output.object({
      name: 'link_classification',
      schema: linkClassificationSchema,
    }),
    temperature: 0.2,
    maxRetries: 1,
    prompt: params.prompt,
  });

  if (!result.output) {
    throw new Error('no structured output');
  }

  const meta = result.output.extracted_metadata ?? {};
  return {
    content_type: coerceLinkContentType(result.output.content_type),
    structured_summary: result.output.structured_summary.trim(),
    extracted_metadata:
      meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {},
  };
}
