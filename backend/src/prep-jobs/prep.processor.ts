import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { PrepRunnerService } from '../agents/prep-runner.service';

@Processor('prep')
export class PrepProcessor extends WorkerHost {
  private readonly log = new Logger(PrepProcessor.name);

  constructor(private readonly runner: PrepRunnerService) {
    super();
  }

  async process(job: Job<{ prepId: string }>): Promise<void> {
    const { prepId } = job.data;
    if (!prepId) {
      this.log.warn('prep job missing prepId');
      return;
    }
    await this.runner.run(prepId);
  }
}
