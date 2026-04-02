import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ProfileRepository } from './profile.repository';
import { ProfileService } from './profile.service';

@Module({
  imports: [DatabaseModule],
  providers: [ProfileRepository, ProfileService],
  exports: [ProfileService, ProfileRepository],
})
export class ProfileModule {}
