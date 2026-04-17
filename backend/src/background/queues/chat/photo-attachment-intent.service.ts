import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { photoAttachmentIntentSystemPrompt } from '../../../chat/prompts/photo-attachment-intent.prompt';

const stanceSchema = z.object({
  stance: z.enum(['directive_organize', 'narrative_or_speculative']),
});

@Injectable()
export class PhotoAttachmentIntentService {
  private readonly log = new Logger(PhotoAttachmentIntentService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * True when the user is asking Pem to organize / extract tasks from the photo
   * (caption, transcript, and vision context). Sole gate for image → full pipeline.
   */
  async isDirectiveOrganizeIntent(pipelineContent: string): Promise<boolean> {
    const trimmed = pipelineContent.trim().slice(0, 12_000);
    if (!trimmed) return false;

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) return false;

    const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    try {
      const openai = createOpenAI({ apiKey });
      const result = await generateText({
        model: openai(modelId),
        output: Output.object({
          name: 'photo_attachment_intent',
          description:
            'Whether user wants inbox extraction from a photo message',
          schema: stanceSchema,
        }),
        temperature: 0.2,
        maxRetries: 1,
        system: photoAttachmentIntentSystemPrompt(),
        prompt: `Message (caption / transcript + image context):\n\n${trimmed}`,
        providerOptions: { openai: { strictJsonSchema: false } },
      });
      return result.output?.stance === 'directive_organize';
    } catch (e) {
      this.log.warn(
        `Photo attachment intent failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return false;
    }
  }
}
