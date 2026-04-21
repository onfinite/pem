import { collectLinkPreviewImageUrlsFromMarkdown } from './link-preview-image-url-from-markdown';
import { linkImageUrlFromMetadata } from './link-image-url-from-metadata';
import { pickBestLinkPreviewImageUrl } from './link-preview-image-url-quality';
import { upgradeAmazonProductImageUrl } from './upgrade-amazon-product-image-url';

export function resolveLinkPreviewImageUrl(
  extractedMetadata: Record<string, unknown> | null | undefined,
  jinaMarkdown: string | null | undefined,
): string | null {
  const urls: string[] = [];
  const meta = linkImageUrlFromMetadata(extractedMetadata);
  if (meta) {
    urls.push(meta);
  }
  urls.push(...collectLinkPreviewImageUrlsFromMarkdown(jinaMarkdown));
  const picked = pickBestLinkPreviewImageUrl(urls);
  return picked ? upgradeAmazonProductImageUrl(picked) : null;
}
