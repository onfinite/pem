import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type MessageEvent,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { Observable } from 'rxjs';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import { dumpsTable, prepsTable, type PrepRow } from '../database/schemas';
import { PrepEventsService } from '../events/prep-events.service';

/**
 * Server-sent events for a dump’s prep lifecycle (Redis pub/sub + DB replay on connect).
 */
@Injectable()
export class PrepsStreamService {
  private readonly log = new Logger(PrepsStreamService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly prepEvents: PrepEventsService,
  ) {}

  streamForDump(dumpId: string, userId: string): Observable<MessageEvent> {
    return new Observable<MessageEvent>((observer) => {
      let closed = false;
      const sub = this.prepEvents.createSubscriber();

      void (async () => {
        try {
          const dumpRows = await this.db
            .select()
            .from(dumpsTable)
            .where(
              and(eq(dumpsTable.id, dumpId), eq(dumpsTable.userId, userId)),
            )
            .limit(1);
          if (!dumpRows[0]) {
            throw new NotFoundException('Dump not found');
          }

          const preps = await this.db
            .select()
            .from(prepsTable)
            .where(
              and(eq(prepsTable.dumpId, dumpId), eq(prepsTable.userId, userId)),
            );

          for (const p of preps) {
            if (closed) return;
            const type = this.eventTypeForPrep(p);
            const payload = JSON.stringify({
              type,
              prep: this.prepPayload(p),
            });
            observer.next({ data: payload });
          }

          if (!sub) {
            this.log.warn('SSE: Redis subscriber unavailable');
            observer.complete();
            return;
          }

          const channel = this.prepEvents.channelForDump(dumpId);
          await sub.subscribe(channel);
          sub.on('message', (ch, message) => {
            if (closed || ch !== channel) return;
            try {
              observer.next({ data: message });
              const parsed = JSON.parse(message) as { type?: string };
              if (parsed.type === 'stream.done') {
                observer.complete();
              }
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              this.log.warn(`SSE message error: ${msg}`);
            }
          });

          sub.on('error', (err: Error) => {
            this.log.warn(`SSE redis error: ${err.message}`);
          });
        } catch (e) {
          observer.error(e);
        }
      })();

      return () => {
        closed = true;
        void sub?.quit();
      };
    });
  }

  private eventTypeForPrep(p: PrepRow): string {
    if (p.status === 'ready') return 'prep.ready';
    if (p.status === 'failed') return 'prep.failed';
    return 'prep.created';
  }

  private prepPayload(p: PrepRow) {
    return {
      id: p.id,
      thought: p.thought || p.title,
      status: p.status,
      render_type: p.renderType,
      summary: p.summary,
      result: p.result,
    };
  }
}
