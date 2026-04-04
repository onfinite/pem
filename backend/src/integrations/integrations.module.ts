import { Global, Module } from '@nestjs/common';

import { SerpApiService } from './serpapi.service';
import { TavilyService } from './tavily.service';

@Global()
@Module({
  providers: [TavilyService, SerpApiService],
  exports: [TavilyService, SerpApiService],
})
export class IntegrationsModule {}
