import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { eq, and } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { extractsTable, logsTable, type ExtractRow } from '../database/schemas';
import { ProfileService } from '../profile/profile.service';

const SYSTEM = `You are Pem, drafting a message on behalf of the user.

Rules:
- Write a brief, natural message the user can send.
- Match the appropriate tone: professional for work, casual for friends/family.
- Keep it concise — 2-5 sentences max.
- Do NOT include greetings like "Dear" unless it's clearly formal.
- Do NOT sign off with the user's name.
- Output ONLY the message text, nothing else.`;

@Injectable()
export class DraftService {
  private readonly log = new Logger(DraftService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly profile: ProfileService,
  ) {}

  async generateDraft(userId: string, extract: ExtractRow): Promise<string> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const memorySection = await this.profile.buildMemoryPromptSection(userId);
    const openai = createOpenAI({ apiKey });

    const prompt = `Draft a message for this task:
"${extract.extractText}"

${extract.pemNote ? `Context: ${extract.pemNote}` : ''}
${extract.draftText ? `Previous draft: ${extract.draftText}` : ''}
${memorySection ? `\nUser context:\n${memorySection}` : ''}

Write a message the user can copy and send.`;

    const result = await generateText({
      model: openai('gpt-4o'),
      system: SYSTEM,
      prompt,
    });

    const draft = result.text.trim();

    await this.db
      .update(extractsTable)
      .set({ draftText: draft, updatedAt: new Date() })
      .where(
        and(eq(extractsTable.id, extract.id), eq(extractsTable.userId, userId)),
      );

    await this.db.insert(logsTable).values({
      userId,
      type: 'extract',
      extractId: extract.id,
      isAgent: true,
      pemNote: 'Draft generated',
      payload: { op: 'draft_generated', draft_length: draft.length },
    });

    return draft;
  }
}
