import { and, eq, inArray } from 'drizzle-orm';

import type { DrizzleDb } from '@/database/database.module';
import { formatChatRecallStamp } from '@/modules/chat/helpers/format-chat-recall-stamp';
import { visionSectionsForKeys } from '@/modules/chat/helpers/photo-vision-multi-sections';
import { visionLineForHumans } from '@/modules/chat/helpers/photo-vision-stored';
import { messagesTable } from '@/database/schemas/index';
import { PHOTO_RECALL_MAX_MESSAGE_IDS } from '@/modules/chat/helpers/resolve-photo-recall-message-ids';

const MAX_CAPTION_CHARS = 1_200;
const MAX_VISION_PER_SECTION = 2_500;

/**
 * Text block injected into Ask / Pem prompts so the model sees the same captions
 * and vision as the "From your photos" strip (not only vector RAG hits).
 */
export async function buildPhotoRecallPromptSection(
  db: DrizzleDb,
  userId: string,
  orderedMessageIds: string[],
  now: Date,
  userTimeZone: string | null | undefined,
): Promise<string | undefined> {
  const ids = [...new Set(orderedMessageIds)].slice(
    0,
    PHOTO_RECALL_MAX_MESSAGE_IDS,
  );
  if (!ids.length) return undefined;

  const rows = await db
    .select({
      id: messagesTable.id,
      content: messagesTable.content,
      visionSummary: messagesTable.visionSummary,
      createdAt: messagesTable.createdAt,
      imageKeys: messagesTable.imageKeys,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.userId, userId),
        inArray(messagesTable.id, ids),
        eq(messagesTable.kind, 'image'),
      ),
    );

  const withVision = rows.filter((r) => (r.visionSummary ?? '').trim().length);
  if (!withVision.length) return undefined;

  const orderMap = new Map(ids.map((id, i) => [id, i]));
  withVision.sort(
    (a, b) => (orderMap.get(a.id) ?? 999) - (orderMap.get(b.id) ?? 999),
  );

  const lines: string[] = [
    'Recalled chat photos (same images as the "From your photos" strip — use the user caption and image detail below; they sent these with the photos):',
  ];

  for (const m of withVision) {
    const stamp = formatChatRecallStamp(m.createdAt, now, userTimeZone);
    const captionRaw = (m.content ?? '').trim();
    const caption =
      captionRaw.length > MAX_CAPTION_CHARS
        ? `${captionRaw.slice(0, MAX_CAPTION_CHARS)}…`
        : captionRaw || '(no caption)';
    const keys = (m.imageKeys ?? []).filter((k) => k.key);
    const visionFull = (m.visionSummary ?? '').trim();
    const keyCount = Math.max(1, keys.length);
    const perKey = visionSectionsForKeys(visionFull, keyCount);
    const visionLines = perKey
      .map((section, i) => {
        const line = visionLineForHumans(section) || section.trim();
        const capped =
          line.length > MAX_VISION_PER_SECTION
            ? `${line.slice(0, MAX_VISION_PER_SECTION)}…`
            : line;
        return keys.length > 1
          ? `  [Image ${i + 1}/${keys.length}] ${capped}`
          : `  ${capped}`;
      })
      .join('\n');
    lines.push(
      `- [${stamp}] message ${m.id}\n  User caption: ${caption}\n  Image detail:\n${visionLines}`,
    );
  }

  return lines.join('\n');
}
