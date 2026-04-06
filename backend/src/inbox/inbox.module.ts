import { Module } from '@nestjs/common';

import { ActionablesModule } from '../actionables/actionables.module';
import { DatabaseModule } from '../database/database.module';
import { InboxEventsModule } from '../inbox-events/inbox-events.module';
import { InboxController } from './inbox.controller';
import { InboxStreamService } from './inbox-stream.service';

@Module({
  imports: [DatabaseModule, ActionablesModule, InboxEventsModule],
  controllers: [InboxController],
  providers: [InboxStreamService],
})
export class InboxModule {}
