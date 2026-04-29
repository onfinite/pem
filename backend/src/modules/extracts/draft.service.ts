import { Injectable } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and } from 'drizzle-orm';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  extractsTable,
  logsTable,
  type ExtractRow,
} from '@/database/schemas/index';
import { ProfileService } from '@/modules/profile/profile.service';
import { generateExtractDraftText } from '@/modules/extracts/agents/draft-llm';

@Injectable()
export class DraftService {
  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly profile: ProfileService,
  ) {}

  async generateDraft(userId: string, extract: ExtractRow): Promise<string> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) throw new Error('OpenAI API key not configured');

    const memorySection = await this.profile.buildMemoryPromptSection(userId);

    const prompt = `Draft a message for this task:
"${extract.extractText}"

${extract.pemNote ? `Context: ${extract.pemNote}` : ''}
${extract.draftText ? `Previous draft: ${extract.draftText}` : ''}
${memorySection ? `\nUser context:\n${memorySection}` : ''}

Write a message the user can copy and send.`;

    const draft = await generateExtractDraftText({
      apiKey,
      userPrompt: prompt,
    });

    const beforeDraft = extract.draftText ?? null;
    const [updated] = await this.db
      .update(extractsTable)
      .set({ draftText: draft, updatedAt: new Date() })
      .where(
        and(eq(extractsTable.id, extract.id), eq(extractsTable.userId, userId)),
      )
      .returning();

    await this.db.insert(logsTable).values({
      userId,
      type: 'extract',
      extractId: extract.id,
      messageId: extract.messageId,
      isAgent: false,
      pemNote: 'Draft generated',
      payload: {
        op: 'draft_generated',
        before: { draft_text: beforeDraft },
        after: { draft_text: updated?.draftText ?? draft },
        draft_length: draft.length,
      },
    });

    return draft;
  }
}
