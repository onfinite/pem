import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { logWithContext } from '@/core/utils/format-log-context';

/** OpenAI Whisper only — shared by dump voice and ask voice; no persistence. */
@Injectable()
export class TranscriptionService {
  private readonly log = new Logger(TranscriptionService.name);

  constructor(private readonly config: ConfigService) {}

  async transcribe(audio: Express.Multer.File): Promise<string> {
    if (!audio?.buffer) {
      throw new BadRequestException('No audio file provided');
    }

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      throw new BadRequestException('Transcription service unavailable');
    }

    const formData = new FormData();
    const blob = new Blob([new Uint8Array(audio.buffer)], {
      type: audio.mimetype || 'audio/m4a',
    });
    formData.append('file', blob, audio.originalname || 'recording.m4a');
    formData.append('model', 'whisper-1');

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      this.log.error(
        logWithContext(`Whisper API error: ${res.status} ${errBody}`, {
          scope: 'whisper',
          httpStatus: res.status,
          fileName: audio.originalname ?? '',
        }),
      );
      throw new BadRequestException('Transcription failed');
    }

    const json = (await res.json()) as { text: string };
    const text = json.text?.trim();
    if (!text) {
      throw new BadRequestException('Could not transcribe audio');
    }
    return text;
  }
}
