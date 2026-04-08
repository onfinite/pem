import { Module } from '@nestjs/common';

import { AskModule } from '../ask/ask.module';
import { DumpsModule } from '../dumps/dumps.module';
import { UsersModule } from '../users/users.module';
import { IntakeController } from './intake.controller';
import { IntakeService } from './intake.service';

@Module({
  imports: [AskModule, DumpsModule, UsersModule],
  controllers: [IntakeController],
  providers: [IntakeService],
})
export class IntakeModule {}
