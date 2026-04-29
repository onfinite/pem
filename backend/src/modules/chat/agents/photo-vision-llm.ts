import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { photoVisionSystemPrompt } from '@/modules/chat/prompts/photo-vision.prompt';

const visionSchema = z.object({
  summary: z
    .string()
    .describe(
      'Retrieval-rich 2–6 sentences for search/RAG: scene, objects, brands, colors, layout, anything on paper — concrete and literal; no invented text.',
    ),
  reply_focus: z
    .string()
    .max(900)
    .describe(
      '1–3 sentences for Pem’s user-facing reply: note/receipt/whiteboard → meaning + key text/structure first, minimal scene fluff. Scenic photo → one tight scene line.',
    ),
  visible_text: z
    .string()
    .describe('Verbatim visible text, or empty string if none'),
  handwriting_quality: z.enum(['clear', 'partial', 'unreadable', 'n/a']),
  is_readable: z.boolean(),
});

export type PhotoVisionResult = z.infer<typeof visionSchema>;

export async function analyzePhotoWithVisionLlm(params: {
  apiKey: string;
  modelId: string;
  imageBytes: Buffer;
  mimeType: string;
}): Promise<PhotoVisionResult | null> {
  const safeMime = params.mimeType.startsWith('image/')
    ? params.mimeType
    : 'image/jpeg';
  const openai = createOpenAI({ apiKey: params.apiKey });
  const result = await generateText({
    model: openai(params.modelId),
    output: Output.object({
      name: 'photo_vision',
      description: 'Structured analysis of user photo',
      schema: visionSchema,
    }),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: photoVisionSystemPrompt() },
          { type: 'image', image: params.imageBytes, mediaType: safeMime },
        ],
      },
    ],
    maxOutputTokens: 2048,
  });
  return result.output ?? null;
}
