/**
 * Many CDNs (LinkedIn, some social) return 403 for in-app Image loads (hotlink / bot protection).
 * Skip loading these URIs so we don't show broken tiles; prefer on-page fetch or open-in-browser for profile photos.
 */
export function isLikelyBlockedRemoteImageUrl(uri: string): boolean {
  const u = uri.trim().toLowerCase();
  if (!u.startsWith("http")) return true;
  if (u.includes("licdn.com") || u.includes("media.licdn.com")) return true;
  if (u.includes("fbcdn.net")) return true;
  return false;
}

/** Protocol-relative and trim fixes for RN `Image` source URIs. */
export function normalizeRemoteImageUri(uri: string): string {
  const u = uri.trim();
  if (!u) return "";
  if (u.startsWith("//")) return `https:${u}`;
  return u;
}
