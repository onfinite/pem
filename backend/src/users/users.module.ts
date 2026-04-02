import { Module } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { UserService } from './user.service';
import { UsersController } from './users.controller';

@Module({
  controllers: [UsersController],
  providers: [UserService, ClerkAuthGuard],
  exports: [UserService],
})
export class UsersModule {}
