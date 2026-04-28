import { Module } from '@nestjs/common';

import { ClerkAuthGuard } from '@/auth/clerk-auth.guard';
import { UserService } from '@/users/user.service';
import { UsersController } from '@/users/users.controller';

@Module({
  controllers: [UsersController],
  providers: [UserService, ClerkAuthGuard],
  exports: [UserService, ClerkAuthGuard],
})
export class UsersModule {}
