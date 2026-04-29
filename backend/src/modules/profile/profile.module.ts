import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { ProfileRepository } from '@/modules/profile/profile.repository';
import { ProfileService } from '@/modules/profile/profile.service';

@Module({
  imports: [DatabaseModule],
  providers: [ProfileRepository, ProfileService],
  exports: [ProfileService, ProfileRepository],
})
export class ProfileModule {}
