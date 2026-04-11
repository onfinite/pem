import { Module } from '@nestjs/common';

import { ListsModule } from '../lists/lists.module';
import { UsersModule } from '../users/users.module';
import { ClerkWebhookController } from './clerk-webhook.controller';

@Module({
  imports: [UsersModule, ListsModule],
  controllers: [ClerkWebhookController],
})
export class WebhooksModule {}
