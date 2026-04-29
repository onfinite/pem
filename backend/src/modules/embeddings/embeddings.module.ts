import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { EmbeddingsService } from '@/modules/embeddings/embeddings.service';

@Module({
  imports: [DatabaseModule],
  providers: [EmbeddingsService],
  exports: [EmbeddingsService],
})
export class EmbeddingsModule {}
