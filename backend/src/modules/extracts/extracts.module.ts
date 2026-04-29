import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CalendarModule } from '@/modules/calendar/calendar.module';
import { DatabaseModule } from '@/database/database.module';
import { ProfileModule } from '@/modules/profile/profile.module';
import { PushModule } from '@/modules/push/push.module';
import { UsersModule } from '@/modules/users/users.module';
import { DraftService } from '@/modules/extracts/draft.service';
import { ExtractsController } from '@/modules/extracts/extracts.controller';
import { ExtractsService } from '@/modules/extracts/extracts.service';
import { RecurrenceCronService } from '@/modules/extracts/recurrence-cron.service';
import { ReminderCronService } from '@/modules/extracts/reminder-cron.service';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    ProfileModule,
    ConfigModule,
    forwardRef(() => CalendarModule),
    PushModule,
  ],
  controllers: [ExtractsController],
  providers: [
    ExtractsService,
    DraftService,
    ReminderCronService,
    RecurrenceCronService,
  ],
  exports: [ExtractsService, UsersModule],
})
export class ExtractsModule {}
