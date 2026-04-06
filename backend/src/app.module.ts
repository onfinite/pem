import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { ActionablesModule } from './actionables/actionables.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { DumpsModule } from './dumps/dumps.module';
import { ExtractionModule } from './extraction/extraction.module';
import { HealthController } from './health/health.controller';
import { InboxEventsModule } from './inbox-events/inbox-events.module';
import { InboxModule } from './inbox/inbox.module';
import { QueueModule } from './queue/queue.module';
import { ThoughtsModule } from './thoughts/thoughts.module';
import { UsersModule } from './users/users.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 100,
      },
    ]),
    InboxEventsModule,
    QueueModule,
    DatabaseModule,
    ExtractionModule,
    DumpsModule,
    ActionablesModule,
    InboxModule,
    ThoughtsModule,
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
