import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ProfileModule } from '../profile/profile.module';
import { UsersModule } from '../users/users.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';

@Module({
  imports: [DatabaseModule, ProfileModule, UsersModule],
  controllers: [AskController],
  providers: [AskService],
})
export class AskModule {}
