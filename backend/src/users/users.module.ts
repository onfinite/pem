import { Module } from '@nestjs/common';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { ProfileModule } from '../profile/profile.module';
import { UserService } from './user.service';
import { UsersController } from './users.controller';

@Module({
  imports: [ProfileModule],
  controllers: [UsersController],
  providers: [UserService, ClerkAuthGuard],
  exports: [UserService, ClerkAuthGuard],
})
export class UsersModule {}
