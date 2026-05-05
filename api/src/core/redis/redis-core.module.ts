import { Module } from '@nestjs/common';

import { UpstashRestRedisService } from '@/core/redis/upstash-rest-redis.service';

@Module({
  providers: [UpstashRestRedisService],
  exports: [UpstashRestRedisService],
})
export class RedisCoreModule {}
