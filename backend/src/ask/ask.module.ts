import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ProfileModule } from '../profile/profile.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { UsersModule } from '../users/users.module';
import { AskController } from './ask.controller';
import { AskService } from './ask.service';

@Module({
  imports: [DatabaseModule, ProfileModule, TranscriptionModule, UsersModule],
  controllers: [AskController],
  providers: [AskService],
  exports: [AskService],
})
export class AskModule {}
