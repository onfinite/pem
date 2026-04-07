import { Module } from '@nestjs/common';

import { ExtractsModule } from '../extracts/extracts.module';
import { DatabaseModule } from '../database/database.module';
import { BackgroundModule } from '../background/background.module';
import { InboxController } from './inbox.controller';
import { InboxStreamService } from './inbox-stream.service';

@Module({
  imports: [DatabaseModule, ExtractsModule, BackgroundModule],
  controllers: [InboxController],
  providers: [InboxStreamService],
})
export class InboxModule {}
