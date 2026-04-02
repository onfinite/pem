import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PrepEventsModule } from '../events/prep-events.module';
import { StepsModule } from '../steps/steps.module';
import { UsersModule } from '../users/users.module';
import { PrepsController } from './preps.controller';
import { PrepsStreamService } from './preps-stream.service';
import { PrepsService } from './preps.service';

@Module({
  imports: [DatabaseModule, UsersModule, StepsModule, PrepEventsModule],
  controllers: [PrepsController],
  providers: [PrepsService, PrepsStreamService],
})
export class PrepsModule {}
