import { collectImageUrlsFromJinaExternal } from './collect-image-urls-from-jina-external';
import { collectLinkPreviewImageUrlsFromMarkdown } from './link-preview-image-url-from-markdown';
import { linkImageUrlFromMetadata } from './link-image-url-from-metadata';
import { pickBestLinkPreviewImageUrl } from './link-preview-image-url-quality';
import { markdownFromJinaSnapshot } from './jina-snapshot-markdown';
import { parseStoredJinaSnapshot } from './parse-stored-jina-snapshot';
import { upgradeAmazonProductImageUrl } from './upgrade-amazon-product-image-url';

export function resolveLinkPreviewImageUrl(
  extractedMetadata: Record<string, unknown> | null | undefined,
  jinaSnapshot: unknown,
): string | null {
  const snap = parseStoredJinaSnapshot(jinaSnapshot);
  const urls: string[] = [];
  const meta = linkImageUrlFromMetadata(extractedMetadata);
  if (meta) {
    urls.push(meta);
  }
  urls.push(...collectImageUrlsFromJinaExternal(snap?.data?.external));
  urls.push(
    ...collectLinkPreviewImageUrlsFromMarkdown(
      markdownFromJinaSnapshot(snap ?? null),
    ),
  );
  const picked = pickBestLinkPreviewImageUrl(urls);
  return picked ? upgradeAmazonProductImageUrl(picked) : null;
}
