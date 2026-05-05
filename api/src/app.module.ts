import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';

import configuration from '@/core/config/configuration';
import { RedisCoreModule } from '@/core/redis/redis-core.module';
import { DatabaseModule } from '@/database/database.module';
import { CalendarModule } from '@/modules/calendar/calendar.module';
import { ChatModule } from '@/modules/chat/chat.module';
import { ExtractsModule } from '@/modules/extracts/extracts.module';
import { HealthModule } from '@/modules/health/health.module';
import { ListsModule } from '@/modules/lists/lists.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { UsersModule } from '@/modules/users/users.module';

const isDev = (process.env.ENV ?? process.env.NODE_ENV ?? 'dev') === 'dev';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    RedisCoreModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: isDev ? 10_000 : 600,
      },
    ]),
    ScheduleModule.forRoot(),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redisUrl');
        if (!url) {
          throw new Error(
            'Redis is required for BullMQ and chat SSE. Set REDIS_URL (e.g. redis://127.0.0.1:6379), or UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN (a rediss:// URL is derived for the same database).',
          );
        }
        return {
          connection: { url },
          defaultJobOptions: {
            removeOnFail: { count: 200 },
          },
        };
      },
      inject: [ConfigService],
    }),
    CalendarModule,
    ChatModule,
    DatabaseModule,
    ExtractsModule,
    HealthModule,
    ListsModule,
    StorageModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
