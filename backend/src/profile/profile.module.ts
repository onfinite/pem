import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { ProfileRepository } from '@/profile/profile.repository';
import { ProfileService } from '@/profile/profile.service';

@Module({
  imports: [DatabaseModule],
  providers: [ProfileRepository, ProfileService],
  exports: [ProfileService, ProfileRepository],
})
export class ProfileModule {}
