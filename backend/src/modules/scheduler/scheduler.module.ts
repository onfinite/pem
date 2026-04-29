import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { CalendarModule } from '@/modules/calendar/calendar.module';
import { SchedulerService } from '@/modules/scheduler/scheduler.service';

@Module({
  imports: [DatabaseModule, forwardRef(() => CalendarModule)],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
