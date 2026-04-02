import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { PrepsController } from './preps.controller';
import { PrepsService } from './preps.service';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [PrepsController],
  providers: [PrepsService],
})
export class PrepsModule {}
