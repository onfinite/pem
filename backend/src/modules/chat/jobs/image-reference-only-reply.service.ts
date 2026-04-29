import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { composeImageReferenceReplyWithLlm } from '@/modules/chat/agents/image-reference-only-reply-llm';

@Injectable()
export class ImageReferenceOnlyReplyService {
  constructor(private readonly config: ConfigService) {}

  async composeReply(pipelineContent: string): Promise<string> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      return this.fallbackReply(pipelineContent);
    }

    try {
      const modelId = this.config.get<string>('openai.model') ?? 'gpt-4o-mini';
      const text = await composeImageReferenceReplyWithLlm({
        apiKey,
        modelId,
        pipelineContentSlice: pipelineContent.slice(0, 12_000),
      });
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
