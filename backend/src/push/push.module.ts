import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { PushService } from './push.service';

@Module({
  imports: [DatabaseModule],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}
