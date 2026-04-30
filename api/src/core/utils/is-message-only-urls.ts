import { extractUrlsFromText } from '@/core/utils/extract-urls-from-text';
import {
  LINK_BARE_URL_REGEX,
  LINK_HTTPS_URL_REGEX,
} from '@/core/utils/link-url-patterns';

/**
 * True when the message is only whitespace and URL tokens (no other words).
 */
export function isMessageOnlyUrls(text: string, urls: string[]): boolean {
  if (urls.length === 0) return false;
  let remainder = text.trim();
  remainder = remainder.replace(LINK_HTTPS_URL_REGEX, ' ');
  remainder = remainder.replace(LINK_BARE_URL_REGEX, ' ');
  const cleaned = remainder.replace(/[,\s]+/g, ' ').trim();
  return cleaned.length === 0;
}

/** Convenience: extract + url-only check. */
export function extractUrlsAndCheckUrlOnly(text: string): {
  urls: string[];
  isUrlOnly: boolean;
} {
  const urls = extractUrlsFromText(text);
  return { urls, isUrlOnly: isMessageOnlyUrls(text, urls) };
}
