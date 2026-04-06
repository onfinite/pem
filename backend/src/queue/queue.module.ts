import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { ExtractionModule } from '../extraction/extraction.module';
import { InboxEventsModule } from '../inbox-events/inbox-events.module';
import { PushModule } from '../push/push.module';
import { DumpProcessor } from './dump-jobs/dump.processor';
import { DumpExtractService } from './dump-jobs/dump-extract.service';

/**
 * BullMQ connection (global), `dump` queue registration, and extraction worker.
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
            'REDIS_URL is required (BullMQ). Set it in .env for the worker queue.',
          );
        }
        return { connection: { url } };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'dump' }),
    DatabaseModule,
    ExtractionModule,
    InboxEventsModule,
    PushModule,
  ],
  providers: [DumpProcessor, DumpExtractService],
  exports: [BullModule],
})
export class QueueModule {}
