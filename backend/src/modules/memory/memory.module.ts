import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { DatabaseModule } from '@/database/database.module';
import { EmbeddingsService } from '@/modules/memory/embeddings.service';

@Module({
  imports: [DatabaseModule, ConfigModule],
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class MemoryModule {}
