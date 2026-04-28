import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { imageReferenceOnlySystemPrompt } from '@/chat/prompts/image-reference-only-reply.prompt';

const replySchema = z.object({
  response_text: z
    .string()
    .max(2000)
    .describe('Natural language reply to the user about their saved photo.'),
});

@Injectable()
export class ImageReferenceOnlyReplyService {
  constructor(private readonly config: ConfigService) {}

  async composeReply(pipelineContent: string): Promise<string> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      return this.fallbackReply(pipelineContent);
    }

    try {
      const openai = createOpenAI({ apiKey });
      const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
      const { output } = await generateText({
        model: openai(modelId),
        output: Output.object({
          name: 'image_reference_only_reply',
          description: 'Acknowledge saved photo without creating tasks',
          schema: replySchema,
        }),
        temperature: 0.35,
        maxRetries: 1,
        system: imageReferenceOnlySystemPrompt(),
        prompt: `Context (caption + image description from Pem's vision):\n${pipelineContent.slice(0, 12_000)}`,
        providerOptions: { openai: { strictJsonSchema: false } },
      });
      const text = output?.response_text?.trim();
      if (text) return text;
    } catch {
      /* fall through */
    }
    return this.fallbackReply(pipelineContent);
  }

  private fallbackReply(pipelineContent: string): string {
    const trimmed = pipelineContent.trim().slice(0, 600);
    const tail = trimmed.length < pipelineContent.trim().length ? '…' : '';
    return (
      `I've got your photo saved in chat. Here's what I could read from it: ${trimmed}${tail} ` +
      `Whenever you want this turned into inbox items, ask in your own words — e.g. to organize it, pull out tasks, or add what you see to your list — and I'll break it down.`
    );
  }
}
