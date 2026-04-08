import { Module } from '@nestjs/common';

import { ExtractsModule } from '../extracts/extracts.module';
import { DatabaseModule } from '../database/database.module';
import { BackgroundModule } from '../background/background.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { UsersModule } from '../users/users.module';
import { DumpsController } from './dumps.controller';
import { DumpsService } from './dumps.service';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    BackgroundModule,
    ExtractsModule,
    TranscriptionModule,
  ],
  controllers: [DumpsController],
  providers: [DumpsService],
  exports: [DumpsService],
})
export class DumpsModule {}
