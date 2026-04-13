import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';

import { ChatService } from './chat.service';

const SUMMARIZE_PROMPT = `You are Pem, summarizing what the user said in a voice dump — like meeting minutes for a conversation with themselves.

Rules:
- Be specific. Name the actual things they mentioned. Never say "you talked about several things."
- Write short, punchy lines. Each line covers one thought or action item.
- Use bullet points (• ) for distinct items. Use a short intro line before the bullets if helpful.
- Keep it under 150 words. Shorter is better.
- Match what Pem actually extracted — tasks, ideas, calendar items. The user uses this to confirm Pem understood correctly.
- If emotions were expressed, note them briefly without being clinical.
- Do not add anything the user did not say.
- Do not use filler like "Let me know if I missed anything" or "Hope this helps."
- Tone: calm, direct, matter-of-fact.`;

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
      throw new BadRequestException('Only voice messages with transcripts can be summarized');
    }
    if (msg.summary) return msg.summary;

    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) throw new BadRequestException('Summarization unavailable');

    const openai = createOpenAI({ apiKey });
    const { text } = await generateText({
      model: openai('gpt-4o-mini'),
      maxRetries: 2,
      system: SUMMARIZE_PROMPT,
      prompt: `Transcript:\n"""${msg.transcript.slice(0, 8000)}"""`,
    });

    const summary = text.trim();
    await this.chat.updateMessage(messageId, { summary }, userId);
    return summary;
  }
}
