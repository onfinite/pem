import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { DumpSplitService } from './dump-split.service';

@Processor('dump')
export class DumpProcessor extends WorkerHost {
  private readonly log = new Logger(DumpProcessor.name);

  constructor(private readonly split: DumpSplitService) {
    super();
  }

  async process(job: Job<{ dumpId: string }>): Promise<void> {
    const { dumpId } = job.data;
    if (!dumpId) {
      this.log.warn('dump job missing dumpId');
      return;
    }
    await this.split.processDump(dumpId);
  }
}
