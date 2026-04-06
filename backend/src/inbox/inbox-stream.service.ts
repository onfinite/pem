import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Observable, Subject } from 'rxjs';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { dumpsTable } from '../database/schemas';
import { InboxEventsService } from '../inbox-events/inbox-events.service';

@Injectable()
export class InboxStreamService {
  private readonly log = new Logger(InboxStreamService.name);

  constructor(
    private readonly events: InboxEventsService,
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
  ) {}

  subscribe(userId: string, dumpId: string): Observable<MessageEvent> {
    const subject = new Subject<MessageEvent>();

    void this.verifyDump(userId, dumpId)
      .then(() => this.attachRedis(subject, dumpId))
      .catch((err: unknown) => {
        subject.error(err);
      });

    return subject.asObservable();
  }

  private async verifyDump(userId: string, dumpId: string): Promise<void> {
    const rows = await this.db
      .select({ id: dumpsTable.id })
      .from(dumpsTable)
      .where(and(eq(dumpsTable.id, dumpId), eq(dumpsTable.userId, userId)))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException('Dump not found');
    }
  }

  private attachRedis(subject: Subject<MessageEvent>, dumpId: string): void {
    const sub = this.events.createSubscriber();
    if (!sub) {
      subject.next({
        data: JSON.stringify({
          type: 'error',
          message: 'Redis not configured',
        }),
      });
      subject.complete();
      return;
    }

    const channel = this.events.channelForDump(dumpId);

    void sub.subscribe(channel);
    sub.on('message', (_chan: string, msg: string) => {
      try {
        const payload = JSON.parse(msg) as Record<string, unknown>;
        const type =
          typeof payload.type === 'string' ? payload.type : 'message';
        subject.next({ type, data: msg });
        if (type === 'stream.done') {
          subject.complete();
          void sub.quit();
        }
      } catch (e) {
        this.log.warn(e instanceof Error ? e.message : String(e));
      }
    });

    sub.on('error', (err: Error) => {
      this.log.warn(err.message);
      subject.error(err);
    });
  }
}
