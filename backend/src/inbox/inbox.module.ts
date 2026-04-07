import { Module } from '@nestjs/common';

import { ActionablesModule } from '../actionables/actionables.module';
import { DatabaseModule } from '../database/database.module';
import { BackgroundModule } from '../background/background.module';
import { InboxController } from './inbox.controller';
import { InboxStreamService } from './inbox-stream.service';

@Module({
  imports: [DatabaseModule, ActionablesModule, BackgroundModule],
  controllers: [InboxController],
  providers: [InboxStreamService],
})
export class InboxModule {}
