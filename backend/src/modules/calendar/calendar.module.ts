import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';

import { ChatModule } from '@/modules/chat/chat.module';
import { DatabaseModule } from '@/database/database.module';
import { UsersModule } from '@/modules/users/users.module';
import { CalendarConnectionService } from '@/modules/calendar/calendar-connection.service';
import { CalendarController } from '@/modules/calendar/calendar.controller';
import { CalendarCronService } from '@/modules/calendar/calendar-cron.service';
import { CalendarSyncProcessor } from '@/modules/calendar/calendar-sync.processor';
import { CalendarSyncService } from '@/modules/calendar/calendar-sync.service';
import { GoogleCalendarService } from '@/modules/calendar/google-calendar.service';

@Module({
  imports: [
    forwardRef(() => ChatModule),
    DatabaseModule,
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
