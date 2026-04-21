import { createHash } from 'node:crypto';

/** Fixed-length key for DB indexes (btree cannot index very long text URLs). */
export function linkCacheKeyFromNormalizedUrl(normalizedUrl: string): string {
  return createHash('sha256').update(normalizedUrl, 'utf8').digest('hex');
}
