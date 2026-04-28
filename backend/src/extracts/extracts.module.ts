import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CalendarModule } from '@/calendar/calendar.module';
import { DatabaseModule } from '@/database/database.module';
import { ProfileModule } from '@/profile/profile.module';
import { UsersModule } from '@/users/users.module';
import { DraftService } from '@/extracts/draft.service';
import { ExtractsController } from '@/extracts/extracts.controller';
import { ExtractsService } from '@/extracts/extracts.service';

@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    ProfileModule,
    ConfigModule,
    CalendarModule,
  ],
  controllers: [ExtractsController],
  providers: [ExtractsService, DraftService],
  exports: [ExtractsService, UsersModule],
})
export class ExtractsModule {}
