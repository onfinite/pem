import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';

import { MessagingModule } from '@/modules/messaging/messaging.module';
import { PushModule } from '@/modules/push/push.module';
import { DatabaseModule } from '@/database/database.module';
import { UsersModule } from '@/modules/users/users.module';
import { CalendarController } from '@/modules/calendar/calendar.controller';
import { CalendarSyncProcessor } from '@/modules/calendar/jobs/calendar-sync.processor';
import { CalendarConnectionService } from '@/modules/calendar/services/calendar-connection.service';
import { CalendarCronService } from '@/modules/calendar/services/calendar-cron.service';
import { CalendarSyncService } from '@/modules/calendar/services/calendar-sync.service';
import { GoogleCalendarService } from '@/modules/calendar/services/google-calendar.service';

@Module({
  imports: [
    forwardRef(() => MessagingModule),
    DatabaseModule,
    PushModule,
    UsersModule,
    BullModule.registerQueue({ name: 'calendar-sync' }),
  ],
  controllers: [CalendarController],
  providers: [
    CalendarConnectionService,
    CalendarSyncService,
    GoogleCalendarService,
    CalendarSyncProcessor,
    CalendarCronService,
  ],
  exports: [
    CalendarConnectionService,
    CalendarSyncService,
    GoogleCalendarService,
  ],
})
export class CalendarModule {}
