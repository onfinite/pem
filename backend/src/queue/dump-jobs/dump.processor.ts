import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { DumpExtractService } from './dump-extract.service';

@Processor('dump')
export class DumpProcessor extends WorkerHost {
  private readonly log = new Logger(DumpProcessor.name);

  constructor(private readonly extract: DumpExtractService) {
    super();
  }

  async process(job: Job<{ dumpId: string }>): Promise<void> {
    const { dumpId } = job.data;
    if (!dumpId) {
      this.log.warn('dump job missing dumpId');
      return;
    }
    await this.extract.processDump(dumpId);
  }
}
