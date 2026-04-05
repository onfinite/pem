import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AgentsModule } from '../agents/agents.module';
import { DatabaseModule } from '../database/database.module';
import { PrepEventsModule } from '../events/prep-events.module';
import { ProfileModule } from '../profile/profile.module';
import { DumpProcessor } from './dump-jobs/dump.processor';
import { DumpSplitService } from './dump-jobs/dump-split.service';
import { PrepProcessor } from './prep-jobs/prep.processor';

/**
 * BullMQ connection (global), queue registration, and **workers** for `dump` + `prep`.
 * Processors live under `dump-jobs/` and `prep-jobs/` folders for clarity — not separate Nest modules.
 */
@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redisUrl');
        if (!url) {
          throw new Error(
            'REDIS_URL is required (BullMQ). Set it in .env for the prep worker queue.',
          );
        }
        return { connection: { url } };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'prep' }),
    BullModule.registerQueue({ name: 'dump' }),
    DatabaseModule,
    AgentsModule,
    ProfileModule,
    PrepEventsModule,
  ],
  providers: [DumpProcessor, DumpSplitService, PrepProcessor],
  exports: [BullModule],
})
export class QueueModule {}
