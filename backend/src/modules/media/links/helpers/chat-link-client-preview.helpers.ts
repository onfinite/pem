import { upgradeAmazonProductImageUrl } from '@/core/utils/upgrade-amazon-product-image-url';
import type { ChatLinkPreviewSerialized } from '@/modules/media/links/types/link-preview.types';
import type { LinkPromptItem } from '@/modules/media/links/helpers/build-link-context-prompt-section';
import type { MessageLinkRow } from '@/database/schemas/index';

/** Best-effort product / og image URL from classifier metadata. */
export function linkImageUrlFromMetadata(
  meta: Record<string, unknown> | null | undefined,
): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const raw = meta.image_url ?? meta.imageUrl;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const u = raw.trim();
  if (!/^https?:\/\//i.test(u)) return null;
  return u.length > 2000 ? u.slice(0, 2000) : u;
}

export function resolveLinkPreviewImageUrl(
  extractedMetadata: Record<string, unknown> | null | undefined,
): string | null {
  const meta = linkImageUrlFromMetadata(extractedMetadata);
  return meta ? upgradeAmazonProductImageUrl(meta) : null;
}

function summaryForClient(s: string | null): string | null {
  if (!s?.trim()) return null;
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

/** Serialize `message_links` rows for the client preview strip. */
export function linkPreviewsSerializedFromRows(
  rows: MessageLinkRow[],
): ChatLinkPreviewSerialized[] {
  return rows.map((r) => ({
    original_url: r.originalUrl,
    canonical_url: r.canonicalUrl,
    title: r.pageTitle,
    content_type: r.contentType,
    fetch_status: r.fetchStatus,
    summary: summaryForClient(r.structuredSummary),
    image_url: resolveLinkPreviewImageUrl(r.extractedMetadata),
  }));
}

/** @deprecated Prefer linkPreviewsSerializedFromRows when MessageLinkRow is available. */
export function linkPreviewsForClient(
  items: LinkPromptItem[],
): ChatLinkPreviewSerialized[] {
  return items.map((i) => ({
    original_url: i.originalUrl,
    canonical_url: i.canonicalUrl,
    title: i.pageTitle,
    content_type: i.contentType,
    fetch_status: i.fetchStatus,
    summary: summaryForClient(i.structuredSummary),
    image_url: resolveLinkPreviewImageUrl(i.extractedMetadata),
  }));
}
