/**
 * Shopping cards must link to retailer PDPs, not news / deal roundups.
 * Used when normalizing SHOPPING_CARD output.
 */

const FORBIDDEN_HOSTS = new Set([
  'today.com',
  'nbcnews.com',
  'msn.com',
  'cnn.com',
  'nytimes.com',
  'washingtonpost.com',
  'theguardian.com',
  'forbes.com',
  'businessinsider.com',
  'insider.com',
  'wired.com',
  'mashable.com',
  'theverge.com',
  'buzzfeed.com',
  'huffpost.com',
  'reddit.com',
  'youtube.com',
  'youtu.be',
  'facebook.com',
  'instagram.com',
  'twitter.com',
  'x.com',
  'tiktok.com',
  'pinterest.com',
]);

export function isForbiddenShoppingProductUrl(url: string): boolean {
  const t = url.trim();
  if (!t.toLowerCase().startsWith('http')) return false;
  try {
    const h = new URL(t).hostname.replace(/^www\./i, '').toLowerCase();
    return FORBIDDEN_HOSTS.has(h);
  } catch {
    return false;
  }
}

/** Returns the URL if allowed, otherwise empty string (omit bad links from cards). */
export function sanitizeShoppingProductUrl(url: string): string {
  const t = url.trim();
  if (!t) return '';
  if (isForbiddenShoppingProductUrl(t)) return '';
  return t;
}
