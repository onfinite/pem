import { Global, Module } from '@nestjs/common';

import { ChatEventsService } from '@/background/chat-events/chat-events.service';

@Global()
@Module({
  providers: [ChatEventsService],
  exports: [ChatEventsService],
})
export class ChatEventsModule {}
