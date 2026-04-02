import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { StepsService } from './steps.service';

@Module({
  imports: [DatabaseModule],
  providers: [StepsService],
  exports: [StepsService],
})
export class StepsModule {}
