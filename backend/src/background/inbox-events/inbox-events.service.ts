import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * **Inbox events (Redis pub/sub)** — not HTTP. The extraction worker runs in the BullMQ
 * process; the mobile app opens **`GET /inbox/stream?dumpId=`** (SSE) on the HTTP process.
 * Workers call `publish(dumpId, payload)` so Redis carries **item.created**, **inbox.updated**,
 * **stream.done** to the SSE subscriber for that dump. One Redis channel per dump:
 * `inbox-events:${dumpId}`.
 */
@Injectable()
export class InboxEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(InboxEventsService.name);
  private pub: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('redisUrl');
    if (!url) {
      this.log.warn('REDIS_URL missing — inbox SSE events disabled');
      return;
    }
    this.pub = new Redis(url, { maxRetriesPerRequest: null });
  }

  onModuleDestroy(): void {
    void this.pub?.quit();
  }

  private requirePub(): Redis {
    if (!this.pub) {
      throw new Error('Redis not configured');
    }
    return this.pub;
  }

  channelForDump(dumpId: string): string {
    return `inbox-events:${dumpId}`;
  }

  async publish(
    dumpId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    if (!this.pub) return;
    try {
      await this.pub.publish(
        this.channelForDump(dumpId),
        JSON.stringify(payload),
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`redis publish failed: ${msg}`);
    }
  }

  /** Duplicate connection for SSE subscribers (must not reuse pub connection). */
  createSubscriber(): Redis | null {
    const url = this.config.get<string>('redisUrl');
    if (!url) return null;
    return new Redis(url, { maxRetriesPerRequest: null });
  }
}
