import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { CalendarSyncService } from '@/modules/calendar/calendar-sync.service';
import { logWithContext } from '@/core/utils/format-log-context';

@Processor('calendar-sync')
export class CalendarSyncProcessor extends WorkerHost {
  private readonly log = new Logger(CalendarSyncProcessor.name);

  constructor(private readonly sync: CalendarSyncService) {
    super();
  }

  async process(job: Job<{ connectionId: string }>): Promise<void> {
    const { connectionId } = job.data;
    if (!connectionId) {
      this.log.warn(
        logWithContext('calendar-sync job missing connectionId', {
          jobId: job.id,
        }),
      );
      return;
    }
    await this.sync.syncGoogleConnection(connectionId);
  }
}
