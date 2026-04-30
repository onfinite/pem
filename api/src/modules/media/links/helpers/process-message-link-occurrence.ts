import { and, desc, eq, gte, inArray } from 'drizzle-orm';

import type { DrizzleDb } from '@/database/database.module';
import {
  messageLinksTable,
  type MessageLinkContentType,
  type MessageLinkFetchStatus,
  type MessageLinkRow,
} from '@/database/schemas/index';
import type { ExtractedUrlOccurrence } from '@/core/utils/extract-urls-from-text';
import { LINK_CACHE_TTL_MS } from '@/modules/media/links/constants/link-reading.constants';
import {
  inferLinkContentTypeFromUrl,
  structuredSummaryFromOgMeta,
} from '@/modules/media/links/helpers/link-reader-derived-fields';
import { isLikelySocialRestrictedHost } from '@/modules/media/links/helpers/restricted-link-hosts';
import { linkCacheKeyFromNormalizedUrl } from '@/core/utils/link-cache-key';
import type { OgHtmlReaderService } from '@/modules/media/links/og-html-reader.service';

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
  ogReader: OgHtmlReaderService,
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

  const og = await ogReader.fetchOgMeta(normalized);
  const canonical =
    og.kind === 'ok' ? og.finalUrl.slice(0, 2000) : normalized.slice(0, 2000);

  let fetchStatus: MessageLinkFetchStatus;
  let structuredSummary: string | null = null;
  let contentType: MessageLinkContentType | null = null;
  let extractedMetadata: Record<string, unknown> | null = null;
  let pageTitle: string | null = null;

  if (og.kind === 'timeout') {
    fetchStatus = 'timeout';
    structuredSummary =
      'Fetching that page timed out. They can try again in a moment or paste the key details.';
  } else if (og.kind === 'blocked') {
    fetchStatus = 'failed';
    structuredSummary =
      'That link could not be fetched safely. Ask them to paste text or try another URL.';
  } else if (
    og.kind === 'http_error' &&
    (og.httpStatus === 401 || og.httpStatus === 403)
  ) {
    fetchStatus = 'unauthorized';
    contentType = hintSocial ? 'social' : 'general';
    structuredSummary = hintSocial
      ? `This looks like a social link on ${host}. The site blocked a preview fetch. They can paste the text or describe what they want saved.`
      : 'That page blocked an automated preview fetch. They can paste what they need saved.';
    extractedMetadata = hintSocial ? { platform: host } : {};
  } else if (og.kind !== 'ok') {
    if (hintSocial) {
      fetchStatus = 'unauthorized';
      contentType = 'social';
      structuredSummary = `This looks like a social link on ${host}. I can't read the full post because it usually requires a log in. Ask them to paste the text or describe what they want saved.`;
      extractedMetadata = { platform: host };
    } else {
      fetchStatus = 'failed';
      structuredSummary =
        'That page did not return readable HTML. It may be private, broken, or blocked. Ask them to paste text or try another link.';
    }
  } else {
    const thinSocial =
      hintSocial && !og.title && !og.description && og.htmlLength < 600;
    const loginWall = og.suspectedLoginWall && og.htmlLength < 50_000;

    if (thinSocial) {
      fetchStatus = 'unauthorized';
      contentType = 'social';
      structuredSummary = `This looks like a social link on ${host}. Only minimal HTML was returned; they can paste the full text if it matters.`;
      extractedMetadata = { platform: host };
    } else if (loginWall) {
      fetchStatus = 'unauthorized';
      contentType = 'general';
      structuredSummary =
        'This page looks like a log in or consent gate; only generic HTML was readable. They can paste what they need saved.';
      extractedMetadata = {};
    } else {
      fetchStatus = 'success';
      contentType = inferLinkContentTypeFromUrl(normalized);
      pageTitle = og.title?.slice(0, 500) ?? null;
      structuredSummary = structuredSummaryFromOgMeta({
        pageTitle: og.title,
        description: og.description,
      });
      extractedMetadata =
        og.imageUrl && /^https?:\/\//i.test(og.imageUrl)
          ? { image_url: og.imageUrl }
          : {};
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
      pageTitle,
      contentType,
      jinaSnapshot: null,
      structuredSummary,
      extractedMetadata,
      fetchStatus,
      fetchedAt: new Date(),
    })
    .returning();

  return row;
}
