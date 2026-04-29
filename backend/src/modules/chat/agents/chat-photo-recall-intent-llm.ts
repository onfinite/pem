import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import {
  photoRecallIntentSystemPrompt,
  photoRecallIntentUserPrompt,
} from '@/modules/chat/prompts/chat-photo-recall-intent.prompt';
import { PHOTO_RECALL_MAX_MESSAGE_IDS } from '@/modules/chat/constants/chat.constants';

const photoRecallIntentSchema = z.object({
  attachRelevantPastPhotos: z
    .boolean()
    .describe(
      'True if past chat photos should appear as thumbnails: explicit photo requests OR memory/conversation recall when candidates relate.',
    ),
  embeddingSearchHint: z
    .string()
    .max(240)
    .optional()
    .describe(
      'When true: short phrase for image similarity search (names, places, events). Omit if not needed.',
    ),
  orderedMessageIds: z
    .array(z.string())
    .max(PHOTO_RECALL_MAX_MESSAGE_IDS)
    .optional()
    .describe(
      'When true: candidate message ids in best-first order. Only ids from the list.',
    ),
});

export type PhotoRecallIntentOutput = z.infer<typeof photoRecallIntentSchema>;

export async function classifyPhotoRecallIntentWithLlm(params: {
  apiKey: string;
  modelId: string;
  userText: string;
  numberedCandidatesBlock: string;
}): Promise<PhotoRecallIntentOutput | null> {
  const openai = createOpenAI({ apiKey: params.apiKey });
  const { output } = await generateText({
    model: openai(params.modelId),
    output: Output.object({
      name: 'chat_photo_recall_intent',
      description:
        'Whether to attach past chat photo thumbnails (explicit ask or memory recall)',
      schema: photoRecallIntentSchema,
    }),
    temperature: 0,
    system: photoRecallIntentSystemPrompt(),
    prompt: photoRecallIntentUserPrompt(
      params.userText,
      params.numberedCandidatesBlock,
    ),
    maxRetries: 2,
    providerOptions: { openai: { strictJsonSchema: false } },
  });
  return output ?? null;
}
