import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => {
        const url = config.get<string>('redisUrl');
        if (!url) {
          throw new Error(
            'REDIS_URL is required (BullMQ). Set it in .env for the prep worker queue.',
          );
        }
        return { connection: { url } };
      },
      inject: [ConfigService],
    }),
    BullModule.registerQueue({ name: 'prep' }),
    BullModule.registerQueue({ name: 'dump' }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
