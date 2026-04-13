import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { CalendarModule } from './calendar/calendar.module';
import { ChatModule } from './chat/chat.module';
import { ExtractsModule } from './extracts/extracts.module';
import { ListsModule } from './lists/lists.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { BackgroundModule } from './background/background.module';
import { HealthController } from './health/health.controller';
import { StorageModule } from './storage/storage.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

const isDev = (process.env.ENV ?? process.env.NODE_ENV ?? 'dev') === 'dev';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: isDev ? 10_000 : 600,
      },
    ]),
    BackgroundModule,
    CalendarModule,
    ChatModule,
    DatabaseModule,
    ExtractsModule,
    ListsModule,
    StorageModule,
    UsersModule,
    WebhooksModule,
  ],
  controllers: [HealthController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
