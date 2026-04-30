import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import { encodePhotoVisionStored } from '@/modules/chat/helpers/photo-vision-stored';
import { logWithContext } from '@/core/utils/format-log-context';

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

@Injectable()
export class PhotoVisionService {
  private readonly log = new Logger(PhotoVisionService.name);

  constructor(private readonly config: ConfigService) {}

  /** System instructions for GPT-4o vision — structured fields parsed via Zod. */
  private photoVisionSystemPrompt(): string {
    return `You analyze a single user photo for Pem (a personal organizer app).

Two audiences — both required:
1) summary (back-office / search): retrieval-rich 2–6 sentences — concrete objects, brands, food names, scenes, colors, layout, dates visible on paper, locations, people count (no identity claims). This can mention props (pen, desk, packaging) when they help search or disambiguate.
2) reply_focus (human chat): 1–3 tight sentences Pem should lean on when replying aloud. If the image is mainly readable text (note, receipt, whiteboard, slide): lead with what it *says* and what it *means* (structure, labels, intent). Skip desk clutter unless it changes meaning. If it is a scenic/general/object photo: one compact scene sentence is enough — no inventory of irrelevant props.

Also:
- Transcribe any visible text in reading order (signs, receipts, whiteboards, handwriting). Use [illegible] where text cannot be read — never invent text.
- handwriting_quality: clear | partial | unreadable | n/a (use n/a for printed text only).
- is_readable: false if the image is too blurry or dark to describe usefully.
- Never output the literal strings <<<PEM_VISION_FOCUS>>> or <<<PEM_VISION_DETAIL>>>.

Output must match the JSON schema exactly.`.trim();
  }

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
    const detail = parts.join('\n\n');
    let focus = v.reply_focus.trim();
    if (!focus) {
      focus = v.summary.trim().slice(0, 420);
    }
    return encodePhotoVisionStored(focus, detail);
  }

  async analyzeImage(
    imageBytes: Buffer,
    mimeType: string,
  ): Promise<{ structured: PhotoVisionResult; flatSummary: string } | null> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      this.log.warn(
        logWithContext('No OpenAI key — skipping photo vision', {
          scope: 'photo_vision',
        }),
      );
      return null;
    }

    const modelId = this.config.get<string>('openai.agentModel') ?? 'gpt-4o';

    try {
      const safeMime = mimeType.startsWith('image/')
        ? mimeType
        : 'image/jpeg';
      const openai = createOpenAI({ apiKey });
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
              { type: 'text', text: this.photoVisionSystemPrompt() },
              { type: 'image', image: imageBytes, mediaType: safeMime },
            ],
          },
        ],
        maxOutputTokens: 2048,
      });
      const structured = result.output ?? null;
      if (!structured) return null;
      return {
        structured,
        flatSummary: this.flattenForStorage(structured),
      };
    } catch (e) {
      this.log.warn(
        logWithContext('Photo vision failed', {
          scope: 'photo_vision',
          err: e instanceof Error ? e.message : String(e),
        }),
      );
      return null;
    }
  }
}
