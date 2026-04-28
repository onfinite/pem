import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { UsersModule } from '@/users/users.module';
import { ListsController } from '@/lists/lists.controller';
import { ListsService } from '@/lists/lists.service';

@Module({
  imports: [DatabaseModule, UsersModule],
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
