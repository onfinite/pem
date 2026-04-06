import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { ActionablesController } from './actionables.controller';
import { ActionablesService } from './actionables.service';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [ActionablesController],
  providers: [ActionablesService],
  exports: [ActionablesService, UsersModule],
})
export class ActionablesModule {}
