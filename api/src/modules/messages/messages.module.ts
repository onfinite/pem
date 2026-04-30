import { Module } from '@nestjs/common';

import { DatabaseModule } from '@/database/database.module';
import { ChatService } from '@/modules/messages/chat.service';

@Module({
  imports: [DatabaseModule],
  providers: [ChatService],
  exports: [ChatService],
})
export class MessagesModule {}
