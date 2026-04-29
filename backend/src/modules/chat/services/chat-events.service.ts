import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { logWithContext } from '@/core/utils/format-log-context';

@Injectable()
export class ChatEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ChatEventsService.name);
  private pub: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('redisUrl');
    if (!url) {
      this.log.warn(
        logWithContext('REDIS_URL missing — chat SSE events disabled', {
          scope: 'chat_events',
        }),
      );
      return;
    }
    this.pub = new Redis(url, { maxRetriesPerRequest: null });
  }

  onModuleDestroy(): void {
    void this.pub?.quit();
  }

  channelForUser(userId: string): string {
    return `chat-events:${userId}`;
  }

  async publish(
    userId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<void> {
    if (!this.pub) return;
    try {
      await this.pub.publish(
        this.channelForUser(userId),
        JSON.stringify({ event, data }),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(
        logWithContext(`redis publish failed: ${msg}`, {
          userId,
          event,
          scope: 'chat_events',
        }),
      );
    }
  }

  createSubscriber(): Redis | null {
    const url = this.config.get<string>('redisUrl');
    if (!url) return null;
    return new Redis(url, { maxRetriesPerRequest: null });
  }
}
