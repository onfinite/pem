import { Injectable, Inject, Logger } from '@nestjs/common';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  messageLinksTable,
  type MessageLinkRow,
} from '@/database/schemas/index';
import type { ExtractedUrlOccurrence } from '@/core/utils/extract-urls-from-text';
import { LINK_READ_MAX_URLS_PER_MESSAGE } from '@/modules/chat/constants/link-reading.constants';
import { JinaReaderService } from '@/modules/chat/jobs/jina-reader.service';
import { LinkContentClassifierService } from '@/modules/chat/jobs/link-content-classifier.service';
import {
  buildLinkContextPromptSection,
  type LinkPromptItem,
} from '@/modules/chat/jobs/build-link-context-prompt-section';
import { processMessageLinkOccurrence } from '@/modules/chat/jobs/process-message-link-occurrence';
import { linkCacheKeyFromNormalizedUrl } from '@/core/utils/link-cache-key';
import { linkRecallExcerptForPrompt } from '@/modules/chat/utils/link-recall-excerpt-for-prompt';
import { logWithContext } from '@/core/utils/format-log-context';

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
          logWithContext('Link pipeline: one URL failed', {
            userId,
            messageId,
            scope: 'link_pipeline',
            err: e instanceof Error ? e.message : 'unknown',
          }),
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
