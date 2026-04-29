import type { JinaSnapshotExternalGroup } from '@/modules/chat/types/jina-snapshot-stored.types';

/** Image URLs declared under Jina Reader `data.external` (icons, apple-touch, etc.). */
export function collectImageUrlsFromJinaExternal(
  external: JinaSnapshotExternalGroup | null | undefined,
): string[] {
  if (!external || typeof external !== 'object') return [];
  const out: string[] = [];
  for (const group of Object.values(external)) {
    if (!group || typeof group !== 'object') continue;
    for (const url of Object.keys(group)) {
      if (/^https?:\/\//i.test(url)) out.push(url);
    }
  }
  return out;
}
