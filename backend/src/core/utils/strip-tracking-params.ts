const TRACKING_KEYS = new Set([
  'fbclid',
  'gclid',
  'igshid',
  'mc_eid',
  '_ga',
  'spm',
]);

/** Remove common tracking query params for cache deduplication. */
export function stripTrackingParamsFromUrl(url: URL): void {
  const toDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    const lower = key.toLowerCase();
    if (lower.startsWith('utm_') || TRACKING_KEYS.has(lower)) {
      toDelete.push(key);
    }
  }
  for (const k of toDelete) url.searchParams.delete(k);
}
