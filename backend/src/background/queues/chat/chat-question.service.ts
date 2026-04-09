import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { and, eq, inArray, desc } from 'drizzle-orm';

import { DRIZZLE } from '../../../database/database.constants';
import type { DrizzleDb } from '../../../database/database.module';
import {
  extractsTable,
  type ExtractRow,
} from '../../../database/schemas';
import { EmbeddingsService } from '../../../embeddings/embeddings.service';
import {
  ExtractsService,
  type BriefBuckets,
} from '../../../extracts/extracts.service';
import { ProfileService } from '../../../profile/profile.service';

function formatBuckets(b: BriefBuckets): string {
  const lines: string[] = [];
  const push = (title: string, rows: { extractText: string }[]) => {
    if (!rows.length) return;
    lines.push(
      `${title}:\n${rows.map((r) => `- ${r.extractText}`).join('\n')}`,
    );
  };
  push('Overdue', b.overdue);
  push('Today', b.today);
  push('Tomorrow', b.tomorrow);
  push('This week', b.this_week);
  push('Next week', b.next_week);
  push('Later', b.later);
  if (b.batch_counts.length) {
    lines.push(
      `Batch counts: ${b.batch_counts.map((c) => `${c.batch_key}=${c.count}`).join(', ')}`,
    );
  }
  return lines.join('\n\n') || '';
}

function formatAllOpen(rows: ExtractRow[]): string {
  if (!rows.length) return 'No open tasks.';
  return rows
    .map((r) => {
      const parts = [r.extractText];
      if (r.batchKey) parts.push(`[${r.batchKey}]`);
      if (r.urgency && r.urgency !== 'none') parts.push(`urgency: ${r.urgency}`);
      if (r.tone) parts.push(`tone: ${r.tone}`);
      if (r.dueAt) parts.push(`due: ${r.dueAt.toISOString()}`);
      if (r.eventStartAt) parts.push(`event: ${r.eventStartAt.toISOString()}`);
      if (r.periodLabel) parts.push(`period: ${r.periodLabel}`);
      return `- ${parts.join(' | ')}`;
    })
    .join('\n');
}

@Injectable()
export class ChatQuestionService {
  private readonly log = new Logger(ChatQuestionService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly embeddings: EmbeddingsService,
    private readonly extracts: ExtractsService,
    private readonly profile: ProfileService,
  ) {}

  async answer(userId: string, question: string, userName?: string | null, userSummary?: string | null): Promise<string> {
    const apiKey = this.config.get<string>('openai.apiKey');
    if (!apiKey) {
      return "I can't look that up right now — try again in a moment.";
    }

    try {
      const [allOpen, buckets, ragHits, memorySection] = await Promise.all([
        this.db
          .select()
          .from(extractsTable)
          .where(
            and(
              eq(extractsTable.userId, userId),
              inArray(extractsTable.status, ['inbox', 'snoozed']),
            ),
          )
          .orderBy(desc(extractsTable.createdAt))
          .limit(100),
        this.extracts.getAskOpenTimelineBuckets(userId),
        this.embeddings.similaritySearch(userId, question, 8),
        this.profile.buildMemoryPromptSection(userId),
      ]);

      const allOpenBlock = formatAllOpen(allOpen);
      const timelineBlock = formatBuckets(buckets);

      const ragBlock =
        ragHits.length > 0
          ? `Related past messages (by similarity):\n${ragHits
              .filter((h) => h.similarity > 0.65)
              .map((h) => `- ${h.content}`)
              .join('\n')}`
          : '';

      const openai = createOpenAI({ apiKey });

      const nameNote = userName ? ` The user's name is ${userName}.` : '';
      const summaryBlock = userSummary ? `\nAbout the user:\n${userSummary}\n\n` : '';

      const { text } = await generateText({
        model: openai('gpt-4o'),
        system: `You are Pem.${nameNote} The user asked a question in chat. Answer using ONLY the context below (all open tasks, timeline view, memory, related messages). If the context does not contain the answer, say you don't have that information yet. Be warm and concise — no markdown. Use a natural list style if listing tasks (e.g. "You have: potatoes, tomatoes, and cherries on your shopping list").`,
        prompt: `${summaryBlock}${memorySection ? `Memory:\n${memorySection}\n\n` : ''}All open tasks:\n${allOpenBlock}\n\n${timelineBlock ? `Timeline view:\n${timelineBlock}\n\n` : ''}${ragBlock ? `${ragBlock}\n\n` : ''}Question:\n"""${question.slice(0, 4000)}"""`,
      });

      return (
        text.trim() ||
        "I don't have enough in your Pem data to answer that yet."
      );
    } catch (e) {
      this.log.warn(
        `Chat question failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
      return "I couldn't answer that just now. Could you try again?";
    }
  }
}
