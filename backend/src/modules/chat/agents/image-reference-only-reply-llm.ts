import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { imageReferenceOnlySystemPrompt } from '@/modules/chat/prompts/image-reference-only-reply.prompt';

const replySchema = z.object({
  response_text: z
    .string()
    .max(2000)
    .describe('Natural language reply to the user about their saved photo.'),
});

export async function composeImageReferenceReplyWithLlm(params: {
  apiKey: string;
  modelId: string;
  pipelineContentSlice: string;
}): Promise<string | null> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const { output } = await generateText({
    model: openai(params.modelId),
    output: Output.object({
      name: 'image_reference_only_reply',
      description: 'Acknowledge saved photo without creating tasks',
      schema: replySchema,
    }),
    temperature: 0.35,
    maxRetries: 1,
    system: imageReferenceOnlySystemPrompt(),
    prompt: `Context (caption + image description from Pem's vision):\n${params.pipelineContentSlice}`,
    providerOptions: { openai: { strictJsonSchema: false } },
  });
  const text = output?.response_text?.trim();
  return text || null;
}
