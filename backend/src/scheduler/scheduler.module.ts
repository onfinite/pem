import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [DatabaseModule],
  providers: [SchedulerService],
  exports: [SchedulerService],
})
export class SchedulerModule {}
