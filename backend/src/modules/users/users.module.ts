import { Module, forwardRef } from '@nestjs/common';

import { ClerkAuthGuard } from '@/core/auth/clerk-auth.guard';
import { ListsModule } from '@/modules/lists/lists.module';
import { ClerkWebhookController } from '@/modules/users/clerk-webhook.controller';
import { UserService } from '@/modules/users/user.service';
import { UsersController } from '@/modules/users/users.controller';

@Module({
  imports: [forwardRef(() => ListsModule)],
  controllers: [UsersController, ClerkWebhookController],
  providers: [UserService, ClerkAuthGuard],
  exports: [UserService, ClerkAuthGuard],
})
export class UsersModule {}
