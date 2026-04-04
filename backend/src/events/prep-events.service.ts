import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const PENDING_KEY_TTL_SEC = 86_400;
/** Ephemeral client location for one prep run — not persisted to Postgres (see pem-location-permission.mdc). */
const CLIENT_LOC_HINT_TTL_SEC = 900;

export type ClientLocationHint =
  | { kind: 'coords'; latitude: number; longitude: number }
  | { kind: 'unavailable' };

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

  private clientLocationHintKey(prepId: string): string {
    return `prep:lochint:${prepId}`;
  }

  /**
   * Stores one-time device location (or "unavailable") for the upcoming agent run.
   * Coordinates must never be written to `preps` — Redis only, short TTL.
   */
  async setClientLocationHint(
    prepId: string,
    hint: ClientLocationHint,
  ): Promise<void> {
    if (!this.pub) return;
    try {
      const key = this.clientLocationHintKey(prepId);
      await this.pub.set(
        key,
        JSON.stringify(hint),
        'EX',
        CLIENT_LOC_HINT_TTL_SEC,
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`setClientLocationHint failed: ${msg}`);
    }
  }

  /**
   * Returns and deletes the hint so it applies to a single run.
   */
  async consumeClientLocationHint(
    prepId: string,
  ): Promise<ClientLocationHint | null> {
    if (!this.pub) return null;
    try {
      const key = this.clientLocationHintKey(prepId);
      const raw = await this.pub.get(key);
      if (raw === null || raw === undefined) {
        return null;
      }
      await this.pub.del(key);
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === 'object' && parsed !== null && 'kind' in parsed) {
        const k = (parsed as { kind: unknown }).kind;
        if (k === 'coords') {
          const o = parsed as {
            kind: 'coords';
            latitude: unknown;
            longitude: unknown;
          };
          if (
            typeof o.latitude === 'number' &&
            typeof o.longitude === 'number'
          ) {
            return {
              kind: 'coords',
              latitude: o.latitude,
              longitude: o.longitude,
            };
          }
        }
        if (k === 'unavailable') {
          return { kind: 'unavailable' };
        }
      }
      return null;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.log.warn(`consumeClientLocationHint failed: ${msg}`);
      return null;
    }
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
