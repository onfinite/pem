import { Module } from '@nestjs/common';

import { ActionablesModule } from '../actionables/actionables.module';
import { DatabaseModule } from '../database/database.module';
import { BackgroundModule } from '../background/background.module';
import { UsersModule } from '../users/users.module';
import { DumpsController } from './dumps.controller';
import { DumpsService } from './dumps.service';

@Module({
  imports: [DatabaseModule, UsersModule, BackgroundModule, ActionablesModule],
  controllers: [DumpsController],
  providers: [DumpsService],
})
export class DumpsModule {}
