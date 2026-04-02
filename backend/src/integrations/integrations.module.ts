import { Global, Module } from '@nestjs/common';

import { TavilyService } from './tavily.service';

@Global()
@Module({
  providers: [TavilyService],
  exports: [TavilyService],
})
export class IntegrationsModule {}
