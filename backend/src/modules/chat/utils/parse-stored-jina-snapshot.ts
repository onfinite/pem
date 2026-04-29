import type { JinaSnapshotStored } from '@/modules/chat/types/jina-snapshot-stored.types';

/** Narrow `message_links.jina_snapshot` jsonb from Drizzle to the stored reader shape. */
export function parseStoredJinaSnapshot(v: unknown): JinaSnapshotStored | null {
  if (v === null || v === undefined) return null;
  if (!v || typeof v !== 'object') return null;
  const data = (v as { data?: unknown }).data;
  if (!data || typeof data !== 'object') return null;
  return v as JinaSnapshotStored;
}
