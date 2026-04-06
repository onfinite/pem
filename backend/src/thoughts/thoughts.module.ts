import { Module } from '@nestjs/common';

import { ActionablesModule } from '../actionables/actionables.module';
import { DatabaseModule } from '../database/database.module';
import { ThoughtsController } from './thoughts.controller';
import { ThoughtsService } from './thoughts.service';

@Module({
  imports: [DatabaseModule, ActionablesModule],
  controllers: [ThoughtsController],
  providers: [ThoughtsService],
})
export class ThoughtsModule {}
