import { Module } from '@nestjs/common';

import { AgentsModule } from '../agents/agents.module';
import { DatabaseModule } from '../database/database.module';
import { QueueModule } from '../queue/queue.module';
import { UsersModule } from '../users/users.module';
import { DumpsController } from './dumps.controller';
import { DumpsService } from './dumps.service';

@Module({
  imports: [DatabaseModule, UsersModule, AgentsModule, QueueModule],
  controllers: [DumpsController],
  providers: [DumpsService],
})
export class DumpsModule {}
