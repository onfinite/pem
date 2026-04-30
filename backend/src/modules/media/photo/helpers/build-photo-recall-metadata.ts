import { and, eq, inArray } from 'drizzle-orm';

import type { DrizzleDb } from '@/database/database.module';
import { PHOTO_RECALL_STRIP_MAX_ITEMS } from '@/modules/chat/constants/chat.constants';
import { visionSectionsForKeys } from '@/modules/media/photo/helpers/photo-vision-multi-sections';
import { visionLineForHumans } from '@/modules/media/photo/helpers/photo-vision-stored';
import { messagesTable, type MessageRow } from '@/database/schemas/index';
import { StorageService } from '@/modules/storage/storage.service';

const URL_TTL_SEC = 3600;

export type PhotoRecallItem = {
  message_id: string;
  image_key: string;
  signed_url: string;
  vision_summary: string | null;
};

/**
 * Build metadata.photo_recall for Pem replies: past chat images when recall intent matches.
 */
export async function buildPhotoRecallMetadata(
  db: DrizzleDb,
  storage: StorageService,
  userId: string,
  ragMessageIds: string[],
): Promise<{ photo_recall: PhotoRecallItem[] } | undefined> {
  const uniqueIds = [...new Set(ragMessageIds)].slice(0, 20);
  if (!uniqueIds.length || !storage.enabled) return undefined;

  const rows = await db
    .select()
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.userId, userId),
        inArray(messagesTable.id, uniqueIds),
        eq(messagesTable.kind, 'image'),
      ),
    );

  const withKeys = rows.filter(
    (m) => m.imageKeys?.length && m.visionSummary?.trim(),
  ) as MessageRow[];
  if (!withKeys.length) return undefined;

  const orderMap = new Map(uniqueIds.map((id, i) => [id, i]));
  withKeys.sort(
    (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999),
  );

  const items: PhotoRecallItem[] = [];
  for (const m of withKeys) {
    if (items.length >= PHOTO_RECALL_STRIP_MAX_ITEMS) break;
    const keys = m.imageKeys!.filter((k) => k.key);
    const visionFull = m.visionSummary!.trim();
    const perKeyVision = visionSectionsForKeys(visionFull, keys.length);
    for (let i = 0; i < keys.length; i++) {
      if (items.length >= PHOTO_RECALL_STRIP_MAX_ITEMS) break;
      const key = keys[i].key;
      const signed = await storage.getSignedUrl(key, URL_TTL_SEC);
      if (!signed) continue;
      const section = perKeyVision[i] ?? visionFull;
      items.push({
        message_id: m.id,
        image_key: key,
        signed_url: signed,
        vision_summary: visionLineForHumans(section) || section.trim(),
      });
    }
  }
  return items.length ? { photo_recall: items } : undefined;
}
