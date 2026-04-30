import { stripTrackingParamsFromUrl } from '@/core/utils/strip-tracking-params';
import { isBlockedSsrFHost } from '@/core/utils/ssrf-guard-for-http-url';

/**
 * Normalize user-typed URL to https URL for fetching. Returns null if invalid or blocked.
 */
export function normalizeUrlForFetch(raw: string): string | null {
  const trimmed = raw.trim().replace(/[),.;]+$/, '');
  if (!trimmed) return null;

  let candidate = trimmed;
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (isBlockedSsrFHost(url.hostname)) return null;

  stripTrackingParamsFromUrl(url);
  return url.href;
}
