import type { PersistedPhotoRecallRow } from "@/services/cache/chatCachePersistedImages";
import type { PhotoRecallItem } from "@/services/api/pemApi";

export type { PersistedPhotoRecallRow } from "@/services/cache/chatCachePersistedImages";

export function mergePhotoRecallWithPersisted(
  items: PhotoRecallItem[] | undefined,
  persisted: PersistedPhotoRecallRow[] | undefined,
): PhotoRecallItem[] {
  if (!items?.length) return [];
  if (!persisted?.length) return items;
  const map = new Map(persisted.map((p) => [p.image_key, p.local_uri]));
  return items.map((item) => {
    const local = map.get(item.image_key);
    if (local) return { ...item, signed_url: local };
    return item;
  });
}
