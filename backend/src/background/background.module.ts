import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { ExtractsModule } from '../extracts/extracts.module';
import { DatabaseModule } from '../database/database.module';
import { ProfileModule } from '../profile/profile.module';
import { PushModule } from '../push/push.module';
import { ExtractionModule } from './agents/extraction/extraction.module';
import { InboxEventsModule } from './inbox-events/inbox-events.module';
import { DumpExtractService } from './queues/dump/dump-extract.service';
import { DumpProcessor } from './queues/dump/dump.processor';

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
    ProfileModule,
    ExtractsModule,
    ExtractionModule,
    InboxEventsModule,
    PushModule,
  ],
  providers: [DumpProcessor, DumpExtractService],
  exports: [BullModule, InboxEventsModule],
})
export class BackgroundModule {}
