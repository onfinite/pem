import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '../database/database.module';
import { ProfileModule } from '../profile/profile.module';
import { UsersModule } from '../users/users.module';
import { DraftService } from './draft.service';
import { ExtractsController } from './extracts.controller';
import { ExtractsService } from './extracts.service';

@Module({
  imports: [DatabaseModule, UsersModule, ProfileModule, ConfigModule],
  controllers: [ExtractsController],
  providers: [ExtractsService, DraftService],
  exports: [ExtractsService, UsersModule],
})
export class ExtractsModule {}
