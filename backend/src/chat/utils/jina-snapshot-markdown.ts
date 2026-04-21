import type { JinaSnapshotStored } from '../types/jina-snapshot-stored.types';

/** Markdown / HTML-ish body from a stored Jina JSON snapshot (for classifiers + image extraction). */
export function markdownFromJinaSnapshot(
  snapshot: JinaSnapshotStored | null | undefined,
): string {
  const c = snapshot?.data?.content;
  return typeof c === 'string' ? c : '';
}
