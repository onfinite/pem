/** Hosts where full post content is usually login-gated for scrapers. */
const SOCIAL_SUFFIXES = [
  'twitter.com',
  'x.com',
  'instagram.com',
  'tiktok.com',
  'facebook.com',
  'fb.com',
  'linkedin.com',
  'threads.net',
  'reddit.com',
];

function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase();
  const p = pattern.toLowerCase();
  return h === p || h.endsWith(`.${p}`);
}

export function isLikelySocialRestrictedHost(hostname: string): boolean {
  return SOCIAL_SUFFIXES.some((s) => hostMatches(hostname, s));
}
