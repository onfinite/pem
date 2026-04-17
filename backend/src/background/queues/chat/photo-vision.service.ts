import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { photoVisionSystemPrompt } from '../../../chat/prompts/photo-vision.prompt';

const visionSchema = z.object({
  summary: z
    .string()
    .describe('Searchable 2–5 sentence description of what is in the image'),
  visible_text: z
    .string()
    .describe('Verbatim visible text, or empty string if none'),
  handwriting_quality: z.enum(['clear', 'partial', 'unreadable', 'n/a']),
  is_readable: z.boolean(),
});

export type PhotoVisionResult = z.infer<typeof visionSchema>;

@Injectable()
export class PhotoVisionService {
  private readonly log = new Logger(PhotoVisionService.name);

  constructor(private readonly config: ConfigService) {}

  flattenForStorage(v: PhotoVisionResult): string {
    const parts: string[] = [v.summary.trim()];
    if (v.visible_text.trim()) {
      parts.push(`Visible text:\n${v.visible_text.trim()}`);
    }
    if (v.handwriting_quality !== 'n/a') {
      parts.push(`Handwriting: ${v.handwriting_quality}`);
    }
    if (!v.is_readable) {
      parts.push('Image was difficult to read clearly.');
    }
    return parts.join('\n\n');
  }

  async analyzeImage(
    imageBytes: Buffer,
    mimeType: string,
  ): Promise<{ structured: PhotoVisionResult; flatSummary: string } | null> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn('No OpenAI key — skipping photo vision');
      return null;
    }
    const safeMime = mimeType.startsWith('image/') ? mimeType : 'image/jpeg';

    const openai = createOpenAI({ apiKey });
    const modelId = this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

    try {
      const result = await generateText({
        model: openai(modelId),
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
              // Raw Buffer + mediaType — data: URLs are rejected ("URL scheme must be http or https").
              { type: 'image', image: imageBytes, mediaType: safeMime },
            ],
          },
        ],
        maxOutputTokens: 2048,
      });
      const structured = result.output;
      if (!structured) return null;
      return {
        structured,
        flatSummary: this.flattenForStorage(structured),
      };
    } catch (e) {
      this.log.warn(
        `Photo vision failed: ${e instanceof Error ? e.message : String(e)}`,
      );
      return null;
    }
  }
}
