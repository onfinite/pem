import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Expo from 'expo-server-sdk';
import type { ExpoPushMessage } from 'expo-server-sdk';

import { DRIZZLE } from '@/database/database.constants';
import type { DrizzleDb } from '@/database/database.module';
import { usersTable } from '@/database/schemas/index';
import { logWithContext } from '@/core/utils/format-log-context';

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private readonly expo = new Expo();

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async notifyInboxUpdated(userId: string): Promise<void> {
    await this.sendPush(userId, {
      title: 'Pem',
      body: 'New items in your inbox.',
      data: { kind: 'inbox_updated' },
    });
  }

  async notifyChatReply(userId: string): Promise<void> {
    await this.sendPush(userId, {
      title: 'Pem',
      body: 'Replied to your message',
      data: { kind: 'chat_reply' },
    });
  }

  async notifyBrief(userId: string): Promise<void> {
    await this.sendPush(userId, {
      title: 'Pem',
      body: 'Your daily brief is ready',
      data: { kind: 'daily_brief' },
    });
  }

  async notifyReminder(userId: string, taskText: string): Promise<void> {
    const body =
      taskText.length > 200 ? taskText.slice(0, 197) + '...' : taskText;
    await this.sendPush(userId, {
      title: 'Reminder',
      body,
      data: { kind: 'reminder' },
    });
  }

  private async sendPush(
    userId: string,
    payload: { title: string; body: string; data: Record<string, unknown> },
  ): Promise<void> {
    const rows = await this.db
      .select({ pushToken: usersTable.pushToken })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const token = rows[0]?.pushToken;
    if (!token) return;
    if (!Expo.isExpoPushToken(token)) {
      this.log.warn(
        logWithContext('Invalid Expo push token — skipping', {
          userId,
          scope: 'push',
        }),
      );
      return;
    }

    const message: ExpoPushMessage = {
      to: token,
      sound: 'default',
      ...payload,
    };

    try {
      const chunks = this.expo.chunkPushNotifications([message]);
      for (const chunk of chunks) {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        for (const t of tickets) {
          if (t.status === 'error')
            this.log.warn(
              logWithContext(`push error: ${t.message}`, {
                userId,
                pushKind: this.pushDataKind(payload.data),
                scope: 'push',
              }),
            );
        }
      }
    } catch (e) {
      this.log.warn(
        logWithContext(e instanceof Error ? e.message : String(e), {
          userId,
          pushKind: this.pushDataKind(payload.data),
          scope: 'push',
        }),
      );
    }
  }

  private pushDataKind(data: Record<string, unknown>): string {
    const k = data.kind;
    return typeof k === 'string' ? k : '';
  }
}
