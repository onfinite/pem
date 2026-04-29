import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { photoAttachmentIntentSystemPrompt } from '@/modules/chat/prompts/photo-attachment-intent.prompt';

const stanceSchema = z.object({
  stance: z.enum(['directive_organize', 'narrative_or_speculative']),
});

export async function classifyPhotoAttachmentStance(params: {
  apiKey: string;
  modelId: string;
  pipelineContent: string;
}): Promise<'directive_organize' | 'narrative_or_speculative' | null> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const result = await generateText({
    model: openai(params.modelId),
    output: Output.object({
      name: 'photo_attachment_intent',
      description: 'Whether user wants inbox extraction from a photo message',
      schema: stanceSchema,
    }),
    temperature: 0.2,
    maxRetries: 1,
    system: photoAttachmentIntentSystemPrompt(),
    prompt: `Message (caption / transcript + image context):\n\n${params.pipelineContent}`,
    providerOptions: { openai: { strictJsonSchema: false } },
  });
  return result.output?.stance ?? null;
}
