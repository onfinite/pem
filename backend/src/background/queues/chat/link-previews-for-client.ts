import type { ChatLinkPreviewSerialized } from '../../../chat/link-preview.types';
import { resolveLinkPreviewImageUrl } from '../../../chat/utils/resolve-link-preview-image-url';
import type { MessageLinkRow } from '../../../database/schemas';
import type { LinkPromptItem } from './build-link-context-prompt-section';

function summaryForClient(s: string | null): string | null {
  if (!s?.trim()) return null;
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
}

/** Prefer DB rows so image_url can fall back to Jina markdown (e.g. Amazon). */
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
    image_url: resolveLinkPreviewImageUrl(r.extractedMetadata, r.jinaSnapshot),
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
    image_url: resolveLinkPreviewImageUrl(i.extractedMetadata, null),
  }));
}
