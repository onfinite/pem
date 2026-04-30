import { BadRequestException } from '@nestjs/common';

import type { MessageImageAsset } from '@/database/schemas/index';
import { MAX_CHAT_MESSAGE_IMAGES } from '@/modules/chat/constants/chat.constants';

/** Returns lowercase 64-char hex or null if invalid / empty. */
export function normalizeContentSha256(
  raw: string | null | undefined,
): string | null {
  if (raw == null || typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  if (s.length !== 64 || !/^[0-9a-f]{64}$/.test(s)) return null;
  return s;
}

export function validateChatImageKeysForUser(
  userId: string,
  keys: {
    key: string;
    mime?: string | null;
    content_sha256?: string | null;
  }[],
): MessageImageAsset[] {
  if (!keys?.length) {
    throw new BadRequestException('image_key or image_keys is required');
  }
  if (keys.length > MAX_CHAT_MESSAGE_IMAGES) {
    throw new BadRequestException(
      `At most ${MAX_CHAT_MESSAGE_IMAGES} images per message`,
    );
  }
  const prefix = `chat-images/${userId}/`;
  const normalized: MessageImageAsset[] = [];
  for (const k of keys) {
    if (!k.key?.startsWith(prefix)) {
      throw new BadRequestException('Invalid image key');
    }
    const rawSha = k.content_sha256;
    const sha =
      rawSha != null && String(rawSha).trim()
        ? normalizeContentSha256(rawSha)
        : null;
    if (rawSha != null && String(rawSha).trim() && !sha) {
      throw new BadRequestException('Invalid content_sha256');
    }
    const asset: MessageImageAsset = { key: k.key, mime: k.mime ?? null };
    if (sha) asset.content_sha256 = sha;
    normalized.push(asset);
  }
  return normalized;
}
