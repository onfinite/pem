import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { UsersModule } from '../users/users.module';
import { ExtractsController } from './extracts.controller';
import { ExtractsService } from './extracts.service';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [ExtractsController],
  providers: [ExtractsService],
  exports: [ExtractsService, UsersModule],
})
export class ExtractsModule {}
