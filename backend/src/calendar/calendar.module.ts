import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarController } from './calendar.controller';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleCalendarService } from './google-calendar.service';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [CalendarController],
  providers: [
    CalendarConnectionService,
    CalendarSyncService,
    GoogleCalendarService,
  ],
  exports: [
    CalendarConnectionService,
    CalendarSyncService,
    GoogleCalendarService,
  ],
})
export class CalendarModule {}
