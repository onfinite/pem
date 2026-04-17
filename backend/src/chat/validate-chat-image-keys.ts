import { BadRequestException } from '@nestjs/common';

import type { MessageImageAsset } from '../database/schemas';
import { MAX_CHAT_MESSAGE_IMAGES } from './chat.constants';

export function validateChatImageKeysForUser(
  userId: string,
  keys: { key: string; mime?: string | null }[],
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
    normalized.push({ key: k.key, mime: k.mime ?? null });
  }
  return normalized;
}
