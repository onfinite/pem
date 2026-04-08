import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { CalendarSyncService } from '../../../calendar/calendar-sync.service';

@Processor('calendar-sync')
export class CalendarSyncProcessor extends WorkerHost {
  private readonly log = new Logger(CalendarSyncProcessor.name);

  constructor(private readonly sync: CalendarSyncService) {
    super();
  }

  async process(job: Job<{ connectionId: string }>): Promise<void> {
    const { connectionId } = job.data;
    if (!connectionId) {
      this.log.warn('calendar-sync job missing connectionId');
      return;
    }
    await this.sync.syncGoogleConnection(connectionId);
  }
}
