import { Injectable } from '@nestjs/common';

import type { MessageRow } from '@/database/schemas/index';
import { StorageService } from '@/modules/storage/storage.service';

/** Serialized chat message fields this service mutates for client reads. */
type HydratableChatMessage = {
  voice_url: string | null;
  image_urls: { key: string; url: string }[] | null;
  metadata: unknown;
};

@Injectable()
export class ChatMessageSignedMediaService {
  constructor(private readonly storage: StorageService) {}

  /** Voice GET URL + image preview URLs + fresh photo_recall signed URLs. */
  async hydrateForClient(
    serialized: HydratableChatMessage,
    row: MessageRow,
  ): Promise<void> {
    if (row.audioKey && this.storage.enabled) {
      serialized.voice_url =
        (await this.storage.getSignedUrl(row.audioKey)) ?? serialized.voice_url;
    }
    const keys = row.imageKeys;
    if (keys?.length && this.storage.enabled) {
      const pairs: { key: string; url: string }[] = [];
      for (const a of keys) {
        const url = await this.storage.getSignedUrl(a.key);
        if (url) pairs.push({ key: a.key, url });
      }
      if (pairs.length) serialized.image_urls = pairs;
    }
    await this.refreshPhotoRecallSignedUrls(serialized);
  }

  /** DB stores short-lived presigned URLs; re-sign keys on each read for the client. */
  private async refreshPhotoRecallSignedUrls(
    serialized: HydratableChatMessage,
  ): Promise<void> {
    if (!this.storage.enabled) return;
    const meta = serialized.metadata;
    if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;

    const metaObj: Record<string, unknown> = { ...meta };
    const recall = metaObj.photo_recall;
    if (!Array.isArray(recall) || recall.length === 0) return;

    const next: Record<string, unknown>[] = await Promise.all(
      recall.map(async (entry): Promise<Record<string, unknown>> => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
          return {};
        }
        const o: Record<string, unknown> = {
          ...(entry as Record<string, unknown>),
        };
        const imageKey = typeof o.image_key === 'string' ? o.image_key : '';
        if (!imageKey) {
          return o;
        }
        const url = await this.storage.getSignedUrl(imageKey);
        return { ...o, signed_url: url ?? o.signed_url };
      }),
    );

    serialized.metadata = { ...metaObj, photo_recall: next };
  }
}
