import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { ChatService } from '@/modules/chat/services/chat.service';
import { summarizeVoiceTranscriptWithLlm } from '@/modules/chat/agents/summarize-transcript-llm';

@Injectable()
export class SummarizeTranscriptService {
  private readonly log = new Logger(SummarizeTranscriptService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly chat: ChatService,
  ) {}

  async summarize(userId: string, messageId: string): Promise<string> {
    const msg = await this.chat.findMessage(messageId, userId);
    if (!msg) throw new NotFoundException('Message not found');
    if (msg.kind !== 'voice' || !msg.transcript?.trim()) {
      throw new BadRequestException(
        'Only voice messages with transcripts can be summarized',
      );
    }
    if (msg.summary) return msg.summary;

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) throw new BadRequestException('Summarization unavailable');

    const summary = await summarizeVoiceTranscriptWithLlm({
      apiKey,
      transcriptSnippet: msg.transcript.slice(0, 8000),
    });
    await this.chat.updateMessage(messageId, { summary }, userId);
    return summary;
  }
}
