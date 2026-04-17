import { and, eq, inArray } from 'drizzle-orm';

import type { DrizzleDb } from '../../../database/database.module';
import { MAX_CHAT_MESSAGE_IMAGES } from '../../../chat/chat.constants';
import { messagesTable, type MessageRow } from '../../../database/schemas';
import { StorageService } from '../../../storage/storage.service';

const URL_TTL_SEC = 3600;

export type PhotoRecallItem = {
  message_id: string;
  image_key: string;
  signed_url: string;
  vision_summary: string | null;
};

/** Aligns with `resolveImagePipelineContent` section delimiter. */
const VISION_SECTION_DELIM = '\n\n---\n\n';

function visionSectionsForKeys(visionFull: string, keyCount: number): string[] {
  if (!visionFull.trim() || keyCount <= 1) {
    return [visionFull.trim()];
  }
  const rawParts = visionFull.split(VISION_SECTION_DELIM);
  const stripped = rawParts.map((s) =>
    s.replace(/^\[Photo \d+\/\d+\]\s*\n?/, '').trim(),
  );
  if (stripped.length === keyCount) return stripped;
  return Array.from({ length: keyCount }, (_, i) => stripped[i] ?? visionFull);
}

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
    if (items.length >= MAX_CHAT_MESSAGE_IMAGES) break;
    const keys = m.imageKeys!.filter((k) => k.key);
    const visionFull = m.visionSummary!.trim();
    const perKeyVision = visionSectionsForKeys(visionFull, keys.length);
    for (let i = 0; i < keys.length; i++) {
      if (items.length >= MAX_CHAT_MESSAGE_IMAGES) break;
      const key = keys[i].key;
      const signed = await storage.getSignedUrl(key, URL_TTL_SEC);
      if (!signed) continue;
      items.push({
        message_id: m.id,
        image_key: key,
        signed_url: signed,
        vision_summary: perKeyVision[i] ?? visionFull,
      });
    }
  }
  return items.length ? { photo_recall: items } : undefined;
}
