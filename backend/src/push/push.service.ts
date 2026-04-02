import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import Expo from 'expo-server-sdk';
import type { ExpoPushMessage } from 'expo-server-sdk';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { usersTable } from '../database/schemas';

@Injectable()
export class PushService {
  private readonly log = new Logger(PushService.name);
  private readonly expo = new Expo();

  constructor(@Inject(DRIZZLE) private readonly db: DrizzleDb) {}

  async notifyPrepReady(userId: string, prepTitle: string): Promise<void> {
    const rows = await this.db
      .select({ pushToken: usersTable.pushToken })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    const token = rows[0]?.pushToken;
    if (!token || !Expo.isExpoPushToken(token)) {
      return;
    }

    const message: ExpoPushMessage = {
      to: token,
      sound: 'default',
      title: 'Prep ready',
      body: prepTitle.slice(0, 120),
      data: { kind: 'prep_ready' },
    };

    try {
      const chunks = this.expo.chunkPushNotifications([message]);
      for (const chunk of chunks) {
        const tickets = await this.expo.sendPushNotificationsAsync(chunk);
        for (const t of tickets) {
          if (t.status === 'error') {
            this.log.warn(`push error: ${t.message}`);
          }
        }
      }
    } catch (e) {
      this.log.warn(e instanceof Error ? e.message : String(e));
    }
  }
}
