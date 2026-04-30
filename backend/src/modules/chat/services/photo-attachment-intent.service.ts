import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { logWithContext } from '@/core/utils/format-log-context';

const stanceSchema = z.object({
  stance: z.enum(['directive_organize', 'narrative_or_speculative']),
});

@Injectable()
export class PhotoAttachmentIntentService {
  private readonly log = new Logger(PhotoAttachmentIntentService.name);

  constructor(private readonly config: ConfigService) {}

  private photoAttachmentIntentSystemPrompt(): string {
    return `
You classify what the user wants when their Pem chat message includes a photo (and may include a caption and/or voice transcript plus Pem's image description).

Return exactly one field "stance" with one of these values:

- "directive_organize" — They want Pem to turn this into concrete organization now: tasks, deadlines, errands, shopping, next steps, reminders, "we need to figure out", "I should plan", "help me organize", "what do I need to do for", extracting actionable items from a flyer/receipt/screenshot/whiteboard. **They are asking Pem to build or manage a list/plan from the image.**

- "narrative_or_speculative" — They are sharing what happened, showing something, telling a story, casual chat, hypotheticals without asking for a list ("wouldn't it be cool if"), or **talking about a future event in a reflective or narrative way without asking Pem to add inbox items**. Voice memo describing the scene only.

**When uncertain or mixed, choose narrative_or_speculative.** Do not assume they want tasks unless the ask is reasonably clear.
`.trim();
  }

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
          description: 'Whether user wants inbox extraction from a photo message',
          schema: stanceSchema,
        }),
        temperature: 0.2,
        maxRetries: 1,
        system: this.photoAttachmentIntentSystemPrompt(),
        prompt: `Message (caption / transcript + image context):\n\n${trimmed}`,
        providerOptions: { openai: { strictJsonSchema: false } },
      });
      const stance = result.output?.stance ?? null;
      return stance === 'directive_organize';
    } catch (e) {
      this.log.warn(
        logWithContext('Photo attachment intent classification failed', {
          scope: 'photo_attachment_intent',
          err: e instanceof Error ? e.message : String(e),
        }),
      );
      return false;
    }
  }
}
