import type { MessageLinkContentType } from '@/database/schemas/index';

const STRUCTURED_SUMMARY_MAX_CHARS = 2000;

/** Preview + LLM context line from OG title + description (no page body fetch). */
export function structuredSummaryFromOgMeta(params: {
  pageTitle: string | null;
  description: string | null;
}): string {
  const title = params.pageTitle?.trim() ?? '';
  const desc = params.description?.trim() ?? '';
  const out = [title, desc].filter(Boolean).join('\n\n').trim();
  if (!out)
    return 'Link saved; no preview text was available in the page head.';
  return out.length > STRUCTURED_SUMMARY_MAX_CHARS
    ? `${out.slice(0, STRUCTURED_SUMMARY_MAX_CHARS - 1)}…`
    : out;
}

/** Light URL/host heuristics for client `content_type` (no LLM). */
export function inferLinkContentTypeFromUrl(
  normalizedUrl: string,
): MessageLinkContentType {
  try {
    const u = new URL(normalizedUrl);
    const h = u.hostname.replace(/^www\./i, '').toLowerCase();
    const p = `${u.pathname}${u.search}`.toLowerCase();
    if (h === 'youtu.be' || h.endsWith('youtube.com')) return 'video';
    if (h.includes('amazon.') || h.endsWith('amazon.com')) return 'product';
    if (
      p.includes('/jobs') ||
      p.includes('/careers') ||
      h.includes('greenhouse.io') ||
      h.includes('lever.co') ||
      h.includes('workday.com')
    ) {
      return 'job';
    }
    if (h.includes('yelp.com') || h.includes('opentable.com'))
      return 'restaurant';
    return 'general';
  } catch {
    return 'general';
  }
}
