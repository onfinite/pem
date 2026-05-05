import { sql, type SQL } from 'drizzle-orm';

import type {
  MessageImageAsset,
  MessageKind,
} from '@/database/schemas/messages.schema';

/** True when the row has at least one non-empty R2 image key. */
export function messageHasImageKeys(
  imageKeys: MessageImageAsset[] | null | undefined,
): boolean {
  return (imageKeys ?? []).some((a) => Boolean(a.key?.trim()));
}

/**
 * User messages eligible for photo recall / image-only RAG: vision text exists and
 * the message is either `kind: image` or `kind: voice` with attached images.
 */
export function isPhotoRecallEligibleMessage(params: {
  role: 'user' | 'pem';
  kind: MessageKind;
  imageKeys: MessageImageAsset[] | null | undefined;
  visionSummary: string | null | undefined;
}): boolean {
  if (params.role !== 'user') return false;
  const vis = (params.visionSummary ?? '').trim();
  if (!vis) return false;
  if (params.kind === 'image') {
    return messageHasImageKeys(params.imageKeys);
  }
  if (params.kind === 'voice') {
    return messageHasImageKeys(params.imageKeys);
  }
  return false;
}

/**
 * SQL predicate for `messages` aliased as `m` (photo recall + image-only vector join).
 * Keep in sync with {@link isPhotoRecallEligibleMessage}.
 */
export const sqlPhotoRecallEligibleMessageAliasM: SQL = sql`(
  m.role = 'user'
  AND m.vision_summary IS NOT NULL
  AND btrim(m.vision_summary) <> ''
  AND (
    (m.kind = 'image' AND coalesce(jsonb_array_length(coalesce(m.image_keys, '[]'::jsonb)), 0) > 0)
    OR (m.kind = 'voice' AND coalesce(jsonb_array_length(coalesce(m.image_keys, '[]'::jsonb)), 0) > 0)
  )
)`;
