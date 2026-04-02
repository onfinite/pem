import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { AgentsModule } from './agents/agents.module';
import configuration from './config/configuration';
import { DatabaseModule } from './database/database.module';
import { DumpsModule } from './dumps/dumps.module';
import { HealthController } from './health/health.controller';
import { IntegrationsModule } from './integrations/integrations.module';
import { PrepJobsModule } from './prep-jobs/prep-jobs.module';
import { PrepsModule } from './preps/preps.module';
import { QueueModule } from './queue/queue.module';
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
    QueueModule,
    IntegrationsModule,
    DatabaseModule,
    AgentsModule,
    PrepJobsModule,
    DumpsModule,
    PrepsModule,
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
