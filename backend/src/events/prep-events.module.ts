import { Global, Module } from '@nestjs/common';

import { PrepEventsService } from './prep-events.service';

@Global()
@Module({
  providers: [PrepEventsService],
  exports: [PrepEventsService],
})
export class PrepEventsModule {}
