import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, Output } from 'ai';
import { z } from 'zod';

import {
  classifyLinkContentPrompt,
  coerceLinkContentType,
} from '@/chat/prompts/classify-link-content.prompt';
import { LINK_CLASSIFIER_MARKDOWN_MAX_CHARS } from '@/chat/link-reading.constants';
import type { MessageLinkContentType } from '@/database/schemas/index';

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

@Injectable()
export class LinkContentClassifierService {
  private readonly log = new Logger(LinkContentClassifierService.name);

  constructor(private readonly config: ConfigService) {}

  async classify(params: {
    normalizedUrl: string;
    host: string;
    markdown: string;
    descriptionHint: string | null;
    hintRestrictedSocial: boolean;
  }): Promise<LinkClassification> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      return {
        content_type: 'general',
        structured_summary: '',
        extracted_metadata: {},
      };
    }

    const excerpt =
      params.markdown.length > LINK_CLASSIFIER_MARKDOWN_MAX_CHARS
        ? `${params.markdown.slice(0, LINK_CLASSIFIER_MARKDOWN_MAX_CHARS)}\n\n…`
        : params.markdown;

    const openai = createOpenAI({ apiKey });
    const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    try {
      const result = await generateText({
        model: openai(modelId),
        output: Output.object({
          name: 'link_classification',
          schema: linkClassificationSchema,
        }),
        temperature: 0.2,
        maxRetries: 1,
        prompt: classifyLinkContentPrompt({
          normalizedUrl: params.normalizedUrl,
          host: params.host,
          markdownExcerpt: excerpt,
          descriptionHint: params.descriptionHint,
          hintRestrictedSocial: params.hintRestrictedSocial,
        }),
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
    } catch (e) {
      this.log.warn(
        `Link classify failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return {
        content_type: 'general',
        structured_summary: '',
        extracted_metadata: {},
      };
    }
  }
}
