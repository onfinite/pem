import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { encodePhotoVisionStored } from '@/modules/chat/utils/photo-vision-stored';
import { logWithContext } from '@/core/utils/format-log-context';
import {
  analyzePhotoWithVisionLlm,
  type PhotoVisionResult,
} from '@/modules/chat/agents/photo-vision-llm';

export type { PhotoVisionResult };

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
      const structured = await analyzePhotoWithVisionLlm({
        apiKey,
        modelId,
        imageBytes,
        mimeType,
      });
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
