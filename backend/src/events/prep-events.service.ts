import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const PENDING_KEY_TTL_SEC = 86_400;

/**
 * Redis pub/sub for prep lifecycle events (SSE) + pending counter per dump.
 */
@Injectable()
export class PrepEventsService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(PrepEventsService.name);
  private pub: Redis | null = null;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    const url = this.config.get<string>('redisUrl');
    if (!url) {
      this.log.warn(
        'REDIS_URL missing — prep events + pending counters disabled',
      );
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
    return `prep-events:${dumpId}`;
  }

  pendingKey(dumpId: string): string {
    return `dump:${dumpId}:pending`;
  }

  async setPendingCount(dumpId: string, count: number): Promise<void> {
    if (!this.pub) return;
    const key = this.pendingKey(dumpId);
    if (count <= 0) {
      await this.pub.set(key, '0', 'EX', PENDING_KEY_TTL_SEC);
      return;
    }
    await this.pub.set(key, String(count), 'EX', PENDING_KEY_TTL_SEC);
  }

  /**
   * Increments remaining preps (e.g. retry after failure). Returns new value, or null if Redis unavailable.
   */
  async incrementPending(dumpId: string): Promise<number | null> {
    if (!this.pub) return null;
    const key = this.pendingKey(dumpId);
    const n = await this.pub.incr(key);
    await this.pub.expire(key, PENDING_KEY_TTL_SEC);
    return n;
  }

  /**
   * Decrements remaining preps for a dump. Returns new value, or null if Redis unavailable.
   */
  async decrementPending(dumpId: string): Promise<number | null> {
    if (!this.pub) return null;
    const key = this.pendingKey(dumpId);
    const n = await this.pub.decr(key);
    return n;
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
