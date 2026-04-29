import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { classifyLinkContentPrompt } from '@/modules/chat/prompts/classify-link-content.prompt';
import { logWithContext } from '@/core/utils/format-log-context';
import { LINK_CLASSIFIER_MARKDOWN_MAX_CHARS } from '@/modules/chat/constants/link-reading.constants';
import {
  classifyLinkContentWithLlm,
  type LinkClassification,
} from '@/modules/chat/agents/link-content-classifier-llm';

export type { LinkClassification };

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

    const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';

    try {
      return await classifyLinkContentWithLlm({
        apiKey,
        modelId,
        prompt: classifyLinkContentPrompt({
          normalizedUrl: params.normalizedUrl,
          host: params.host,
          markdownExcerpt: excerpt,
          descriptionHint: params.descriptionHint,
          hintRestrictedSocial: params.hintRestrictedSocial,
        }),
      });
    } catch (e) {
      this.log.warn(
        logWithContext('Link content classify failed', {
          scope: 'link_classifier',
          host: params.host,
          urlSnippet: params.normalizedUrl.slice(0, 120),
          err: e instanceof Error ? e.message : 'unknown',
        }),
      );
      return {
        content_type: 'general',
        structured_summary: '',
        extracted_metadata: {},
      };
    }
  }
}
