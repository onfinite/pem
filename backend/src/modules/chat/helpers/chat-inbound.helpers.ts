import { BadRequestException } from '@nestjs/common';

import {
  CHAT_JOB_DELAY_MS_DUMP,
  CHAT_JOB_ID_PREFIX,
} from '@/modules/chat/constants/chat.constants';

/** File extension segment for R2 keys from upload Content-Type. */
export function photoKeyExtension(contentType: string): string {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
}

export function buildChatProcessMessageJobOpts(messageId: string) {
  return {
    jobId: `${CHAT_JOB_ID_PREFIX}${messageId}`,
    delay: CHAT_JOB_DELAY_MS_DUMP,
    attempts: 3,
    backoff: { type: 'exponential' as const, delay: 2000 },
  };
}

export type RawImageKeyInput = {
  key: string;
  mime: string | null;
  content_sha256: string | null;
};

/** Normalizes `image_keys` / legacy `image_key` from POST /chat/messages JSON body. */
export function rawImageInputsFromSendPayload(params: {
  image_keys?: {
    key: string;
    mime?: string | null;
    content_sha256?: string | null;
  }[];
  image_key?: string | null;
}): RawImageKeyInput[] {
  const keysFromArray =
    params.image_keys && params.image_keys.length > 0
      ? params.image_keys.map((k) => ({
          key: k.key,
          mime: k.mime ?? null,
          content_sha256: k.content_sha256 ?? null,
        }))
      : null;
  const keysRaw =
    keysFromArray ??
    (params.image_key?.trim()
      ? [
          {
            key: params.image_key.trim(),
            mime: null,
            content_sha256: null,
          },
        ]
      : null);
  return keysRaw ?? [];
}

/** Parses `image_keys` JSON array from multipart voice upload body. */
export function parseMultipartImageKeysJson(json: string): RawImageKeyInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json) as unknown;
  } catch {
    throw new BadRequestException('image_keys must be valid JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new BadRequestException('image_keys must be a JSON array');
  }
  return parsed.map((item): RawImageKeyInput => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new BadRequestException('Invalid image_keys entry');
    }
    const o = item as Record<string, unknown>;
    const key = typeof o.key === 'string' ? o.key : '';
    if (!key) {
      throw new BadRequestException('Each image_keys item needs a key');
    }
    const mime = typeof o.mime === 'string' ? o.mime : null;
    const content_sha256 =
      typeof o.content_sha256 === 'string' ? o.content_sha256 : null;
    return { key, mime, content_sha256 };
  });
}
