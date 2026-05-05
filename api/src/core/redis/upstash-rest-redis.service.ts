import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';

import type { AppConfig } from '@/core/config/configuration';

@Injectable()
export class UpstashRestRedisService {
  private readonly client: Redis | null;

  constructor(private readonly config: ConfigService) {
    const upstash = this.config.get<AppConfig['upstash']>('upstash');
    this.client =
      upstash?.restUrl && upstash?.restToken
        ? new Redis({ url: upstash.restUrl, token: upstash.restToken })
        : null;
  }

  /** `@upstash/redis` REST client, or null when REST env vars are not both set. */
  get rest(): Redis | null {
    return this.client;
  }
}
