import { and, desc, eq, gte, inArray } from 'drizzle-orm';

import type { DrizzleDb } from '../../../database/database.module';
import {
  messageLinksTable,
  type MessageLinkContentType,
  type MessageLinkFetchStatus,
  type MessageLinkRow,
} from '../../../database/schemas';
import type { ExtractedUrlOccurrence } from '../../../chat/utils/extract-urls-from-text';
import { LINK_CACHE_TTL_MS } from '../../../chat/link-reading.constants';
import type { JinaSnapshotStored } from '../../../chat/types/jina-snapshot-stored.types';
import { linkTitleHintFromMarkdown } from '../../../chat/utils/link-title-from-markdown';
import { normalizeJinaSnapshotForStorage } from '../../../chat/utils/normalize-jina-snapshot-for-storage';
import type { JinaReaderService } from './jina-reader.service';
import type { LinkContentClassifierService } from './link-content-classifier.service';
import { isLikelySocialRestrictedHost } from './restricted-link-hosts';
import { looksLikeLoginWallMarkdown } from './link-login-wall-heuristic';
import { linkCacheKeyFromNormalizedUrl } from '../../../chat/utils/link-cache-key';

async function findFreshCache(
  db: DrizzleDb,
  userId: string,
  cacheKey: string,
): Promise<MessageLinkRow | null> {
  const cutoff = new Date(Date.now() - LINK_CACHE_TTL_MS);
  const [hit] = await db
    .select()
    .from(messageLinksTable)
    .where(
      and(
        eq(messageLinksTable.userId, userId),
        eq(messageLinksTable.cacheKey, cacheKey),
        inArray(messageLinksTable.fetchStatus, ['success', 'cached']),
        gte(messageLinksTable.fetchedAt, cutoff),
      ),
    )
    .orderBy(desc(messageLinksTable.fetchedAt))
    .limit(1);
  return hit ?? null;
}

export async function processMessageLinkOccurrence(
  db: DrizzleDb,
  jina: JinaReaderService,
  classifier: LinkContentClassifierService,
  userId: string,
  messageId: string,
  occ: ExtractedUrlOccurrence,
): Promise<MessageLinkRow> {
  const normalized = occ.normalized;
  const cacheKey = linkCacheKeyFromNormalizedUrl(normalized);
  let host = '';
  try {
    host = new URL(normalized).hostname;
  } catch {
    const [row] = await db
      .insert(messageLinksTable)
      .values({
        userId,
        messageId,
        originalUrl: occ.raw.slice(0, 2000),
        normalizedFetchUrl: normalized,
        cacheKey,
        canonicalUrl: null,
        fetchStatus: 'malformed',
        structuredSummary:
          'That does not look like a valid web link. Check the URL or paste the text you want to keep.',
        fetchedAt: new Date(),
      })
      .returning();
    return row;
  }

  const hintSocial = isLikelySocialRestrictedHost(host);

  const cached = await findFreshCache(db, userId, cacheKey);
  if (cached) {
    const [row] = await db
      .insert(messageLinksTable)
      .values({
        userId,
        messageId,
        originalUrl: occ.raw.slice(0, 2000),
        normalizedFetchUrl: normalized,
        cacheKey,
        canonicalUrl: cached.canonicalUrl,
        pageTitle: cached.pageTitle,
        contentType: cached.contentType,
        jinaSnapshot: cached.jinaSnapshot,
        structuredSummary: cached.structuredSummary,
        extractedMetadata: cached.extractedMetadata,
        fetchStatus: 'cached',
        fetchedAt: cached.fetchedAt,
      })
      .returning();
    return row;
  }

  const jinaResult = await jina.fetchPage(normalized);
  const canonical = (jinaResult.canonicalUrl ?? normalized).slice(0, 2000);
  const md = jinaResult.markdown;
  const titleHint =
    jinaResult.titleFromApi?.trim() ||
    (md ? linkTitleHintFromMarkdown(md) : null) ||
    null;

  let fetchStatus: MessageLinkFetchStatus;
  let structuredSummary: string | null = null;
  let contentType: MessageLinkContentType | null = null;
  let extractedMetadata: Record<string, unknown> | null = null;
  let snapshotStored: JinaSnapshotStored | null = null;

  if (jinaResult.timedOut) {
    fetchStatus = 'timeout';
    structuredSummary =
      'Fetching that page timed out. They can try again in a moment or paste the key details.';
  } else if (!md && hintSocial) {
    fetchStatus = 'unauthorized';
    contentType = 'social';
    structuredSummary = `This looks like a social link on ${host}. I can't read the full post because it usually requires a log in. Ask them to paste the text or describe what they want saved.`;
    extractedMetadata = { platform: host };
  } else if (!md) {
    fetchStatus = 'failed';
    structuredSummary =
      'That page did not return readable content. It may be private, broken, or blocked. Ask them to paste text or try another link.';
  } else {
    if (jinaResult.snapshot) {
      snapshotStored = normalizeJinaSnapshotForStorage(jinaResult.snapshot);
    }
    const thinSocial = hintSocial && md.length < 500;
    const loginWall = looksLikeLoginWallMarkdown(md) && md.length < 900;

    const descriptionHint =
      jinaResult.snapshot?.data?.description?.trim()?.slice(0, 2000) ?? null;

    const classified = await classifier.classify({
      normalizedUrl: normalized,
      host,
      markdown: md,
      descriptionHint,
      hintRestrictedSocial: hintSocial,
    });

    contentType = classified.content_type;
    structuredSummary = classified.structured_summary;
    extractedMetadata = classified.extracted_metadata;

    if (thinSocial || loginWall) {
      fetchStatus = 'unauthorized';
    } else {
      fetchStatus = 'success';
    }
  }

  const [row] = await db
    .insert(messageLinksTable)
    .values({
      userId,
      messageId,
      originalUrl: occ.raw.slice(0, 2000),
      normalizedFetchUrl: normalized,
      cacheKey,
      canonicalUrl: canonical,
      pageTitle: titleHint?.slice(0, 500) ?? null,
      contentType,
      jinaSnapshot: snapshotStored,
      structuredSummary,
      extractedMetadata,
      fetchStatus,
      fetchedAt: new Date(),
    })
    .returning();

  return row;
}
