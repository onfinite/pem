import { Injectable, Inject, Logger } from '@nestjs/common';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  messageLinksTable,
  type MessageLinkRow,
} from '@/database/schemas/index';
import type { ExtractedUrlOccurrence } from '@/chat/utils/extract-urls-from-text';
import { LINK_READ_MAX_URLS_PER_MESSAGE } from '@/chat/link-reading.constants';
import { JinaReaderService } from '@/background/queues/chat/jina-reader.service';
import { LinkContentClassifierService } from '@/background/queues/chat/link-content-classifier.service';
import {
  buildLinkContextPromptSection,
  type LinkPromptItem,
} from '@/background/queues/chat/build-link-context-prompt-section';
import { processMessageLinkOccurrence } from '@/background/queues/chat/process-message-link-occurrence';
import { linkCacheKeyFromNormalizedUrl } from '@/chat/utils/link-cache-key';
import { linkRecallExcerptForPrompt } from '@/chat/utils/link-recall-excerpt-for-prompt';

export type LinkPipelineResult = {
  promptSection: string;
  items: LinkPromptItem[];
  rows: MessageLinkRow[];
};

function rowToPromptItem(r: MessageLinkRow): LinkPromptItem {
  const recallExcerpt =
    r.fetchStatus === 'success' || r.fetchStatus === 'cached'
      ? linkRecallExcerptForPrompt(r.jinaSnapshot)
      : null;
  return {
    originalUrl: r.originalUrl,
    canonicalUrl: r.canonicalUrl,
    fetchStatus: r.fetchStatus,
    contentType: r.contentType,
    pageTitle: r.pageTitle,
    structuredSummary: r.structuredSummary,
    extractedMetadata: r.extractedMetadata,
    recallExcerpt,
  };
}

@Injectable()
export class ChatLinkPipelineService {
  private readonly log = new Logger(ChatLinkPipelineService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly jina: JinaReaderService,
    private readonly classifier: LinkContentClassifierService,
  ) {}

  async processForMessage(
    userId: string,
    messageId: string,
    occurrences: ExtractedUrlOccurrence[],
  ): Promise<LinkPipelineResult> {
    const slice = occurrences.slice(0, LINK_READ_MAX_URLS_PER_MESSAGE);
    const inserted: MessageLinkRow[] = [];

    for (const occ of slice) {
      try {
        inserted.push(
          await processMessageLinkOccurrence(
            this.db,
            this.jina,
            this.classifier,
            userId,
            messageId,
            occ,
          ),
        );
      } catch (e) {
        this.log.warn(
          `link pipeline one URL failed messageId=${messageId} err=${e instanceof Error ? e.message : 'unknown'}`,
        );
        const [fallback] = await this.db
          .insert(messageLinksTable)
          .values({
            userId,
            messageId,
            originalUrl: occ.raw.slice(0, 2000),
            normalizedFetchUrl: occ.normalized,
            cacheKey: linkCacheKeyFromNormalizedUrl(occ.normalized),
            canonicalUrl: null,
            pageTitle: null,
            contentType: 'general',
            jinaSnapshot: null,
            structuredSummary:
              'This link could not be processed. Ask the user to try again or paste what they need saved.',
            extractedMetadata: {},
            fetchStatus: 'failed',
            fetchedAt: new Date(),
          })
          .returning();
        inserted.push(fallback);
      }
    }

    const items = inserted.map(rowToPromptItem);
    return {
      promptSection: buildLinkContextPromptSection(items),
      items,
      rows: inserted,
    };
  }
}
