import { Injectable, Inject } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import {
  chatImageHashesTable,
  type MessageImageAsset,
} from '@/database/schemas/index';
import {
  normalizeContentSha256,
  validateChatImageKeysForUser,
} from '@/modules/chat/helpers/chat-image-keys.helpers';

@Injectable()
export class ChatImageDedupService {
  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async findExistingByHash(
    userId: string,
    contentSha256Raw: string,
  ): Promise<{ imageKey: string; firstSharedAt: Date } | null> {
    const hash = normalizeContentSha256(contentSha256Raw);
    if (!hash) return null;
    const [row] = await this.db
      .select({
        imageKey: chatImageHashesTable.imageKey,
        createdAt: chatImageHashesTable.createdAt,
      })
      .from(chatImageHashesTable)
      .where(
        and(
          eq(chatImageHashesTable.userId, userId),
          eq(chatImageHashesTable.contentSha256, hash),
        ),
      )
      .limit(1);
    if (!row) return null;
    return { imageKey: row.imageKey, firstSharedAt: row.createdAt };
  }

  async prepareImageKeysForPersistence(
    userId: string,
    raw: {
      key: string;
      mime?: string | null;
      content_sha256?: string | null;
    }[],
  ): Promise<MessageImageAsset[]> {
    const validated = validateChatImageKeysForUser(userId, raw);
    return this.normalizeImageKeys(userId, validated);
  }

  async normalizeImageKeys(
    userId: string,
    keys: MessageImageAsset[],
  ): Promise<MessageImageAsset[]> {
    const out: MessageImageAsset[] = [];
    for (const k of keys) {
      const hash = normalizeContentSha256(k.content_sha256 ?? null);
      if (!hash) {
        out.push({ key: k.key, mime: k.mime ?? null });
        continue;
      }
      const existing = await this.findExistingByHash(userId, hash);
      if (existing) {
        out.push({
          key: existing.imageKey,
          mime: k.mime ?? null,
          content_sha256: hash,
        });
      } else {
        out.push({
          key: k.key,
          mime: k.mime ?? null,
          content_sha256: hash,
        });
      }
    }
    return out;
  }

  async registerHashes(
    userId: string,
    keys: MessageImageAsset[],
  ): Promise<void> {
    const rows = keys
      .map((k) => {
        const h = normalizeContentSha256(k.content_sha256 ?? null);
        if (!h) return null;
        return {
          userId,
          contentSha256: h,
          imageKey: k.key,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r != null);
    if (rows.length === 0) return;
    await this.db
      .insert(chatImageHashesTable)
      .values(rows)
      .onConflictDoNothing({
        target: [
          chatImageHashesTable.userId,
          chatImageHashesTable.contentSha256,
        ],
      });
  }
}
