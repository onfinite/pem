import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { CalendarModule } from '@/calendar/calendar.module';
import { SchedulerService } from '@/scheduler/scheduler.service';

@Module({
  imports: [DatabaseModule, CalendarModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
