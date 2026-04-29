import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { logWithContext } from '@/core/utils/format-log-context';
import { classifyPhotoAttachmentStance } from '@/modules/chat/agents/photo-attachment-intent-llm';

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
      const stance = await classifyPhotoAttachmentStance({
        apiKey,
        modelId,
        pipelineContent: trimmed,
      });
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
