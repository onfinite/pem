import { Module, forwardRef } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { ListsController } from '@/modules/lists/lists.controller';
import { ListsService } from '@/modules/lists/lists.service';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [DatabaseModule, forwardRef(() => UsersModule)],
  controllers: [ListsController],
  providers: [ListsService],
  exports: [ListsService],
})
export class ListsModule {}
