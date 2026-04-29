import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject, merge, interval } from 'rxjs';
import { finalize, map } from 'rxjs/operators';

import { ChatEventsService } from '@/modules/chat/services/chat-events.service';
import { logWithContext } from '@/core/utils/format-log-context';

const HEARTBEAT_MS = 30_000;

export interface SseEvent {
  data: string;
  type?: string;
}

@Injectable()
export class ChatStreamService {
  private readonly log = new Logger(ChatStreamService.name);

  constructor(private readonly chatEvents: ChatEventsService) {}

  createStream(userId: string): Observable<SseEvent> {
    const redis = this.chatEvents.createSubscriber();
    if (!redis) {
      return new Observable((observer) => {
        observer.next({ data: JSON.stringify({ error: 'SSE not available' }) });
        observer.complete();
      });
    }

    const channel = this.chatEvents.channelForUser(userId);
    const subject = new Subject<SseEvent>();

    redis.subscribe(channel).catch((err) => {
      this.log.error(
        logWithContext(`Subscribe failed: ${err}`, {
          userId,
          channel,
          scope: 'chat_sse',
        }),
      );
      subject.complete();
    });

    redis.on('message', (_ch: string, raw: string) => {
      try {
        const parsed = JSON.parse(raw) as { event: string; data: unknown };
        subject.next({
          type: parsed.event,
          data: JSON.stringify(parsed.data),
        });
      } catch {
        subject.next({ data: raw });
      }
    });

    const heartbeat$ = interval(HEARTBEAT_MS).pipe(
      map(
        (): SseEvent => ({
          type: 'heartbeat',
          data: JSON.stringify({ ok: true }),
        }),
      ),
    );

    return merge(subject, heartbeat$).pipe(
      finalize(() => {
        void redis.unsubscribe(channel).then(() => redis.quit());
      }),
    );
  }
}
