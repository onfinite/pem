import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';

import { BriefsModule } from '@/modules/briefs/briefs.module';
import { ChatController } from '@/modules/chat/chat.controller';
import { MediaModule } from '@/modules/media/media.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { MessagingModule } from '@/modules/messaging/messaging.module';
import { StorageModule } from '@/modules/storage/storage.module';
import { UsersModule } from '@/modules/users/users.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'chat' }),
    UsersModule,
    MessagesModule,
    MediaModule,
    MessagingModule,
    BriefsModule,
    StorageModule,
  ],
  controllers: [ChatController],
  exports: [MessagesModule, MessagingModule],
})
export class ChatModule {}
