import { normalizeUrlForFetch } from '@/core/utils/normalize-url-for-fetch';
import {
  LINK_BARE_URL_REGEX,
  LINK_HTTPS_URL_REGEX,
} from '@/core/utils/link-url-patterns';

export type ExtractedUrlOccurrence = { normalized: string; raw: string };

function dedupeOccurrencesPreserveOrder(
  items: ExtractedUrlOccurrence[],
): ExtractedUrlOccurrence[] {
  const seen = new Set<string>();
  const out: ExtractedUrlOccurrence[] = [];
  for (const it of items) {
    if (seen.has(it.normalized)) continue;
    seen.add(it.normalized);
    out.push(it);
  }
  return out;
}

/**
 * Extract fetchable URLs from message text (http(s) and scheme-less hosts).
 * `raw` is the substring as it appeared in the message; `normalized` is for fetch/cache.
 */
/**
 * Union of URLs found in any of the strings (e.g. raw caption + vision-expanded content).
 * Preserves first-seen order; dedupes by normalized URL.
 */
export function extractUrlOccurrencesFromTexts(
  ...texts: string[]
): ExtractedUrlOccurrence[] {
  const found: ExtractedUrlOccurrence[] = [];
  for (const t of texts) {
    if (t?.trim()) found.push(...extractUrlOccurrencesFromText(t));
  }
  return dedupeOccurrencesPreserveOrder(found);
}

export function extractUrlOccurrencesFromText(
  text: string,
): ExtractedUrlOccurrence[] {
  const found: ExtractedUrlOccurrence[] = [];
  const t = text;

  let m: RegExpExecArray | null;
  const reHttp = new RegExp(
    LINK_HTTPS_URL_REGEX.source,
    LINK_HTTPS_URL_REGEX.flags,
  );
  while ((m = reHttp.exec(t)) !== null) {
    const raw = m[0];
    const n = normalizeUrlForFetch(raw);
    if (n) found.push({ normalized: n, raw });
  }

  const reBare = new RegExp(
    LINK_BARE_URL_REGEX.source,
    LINK_BARE_URL_REGEX.flags,
  );
  while ((m = reBare.exec(t)) !== null) {
    const raw = m[0];
    if (/^https?:\/\//i.test(raw)) continue;
    const n = normalizeUrlForFetch(raw);
    if (n) found.push({ normalized: n, raw });
  }

  return dedupeOccurrencesPreserveOrder(found);
}

export function extractUrlsFromText(text: string): string[] {
  return extractUrlOccurrencesFromText(text).map((o) => o.normalized);
}
