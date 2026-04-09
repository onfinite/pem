import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

import { ChatEventsService } from '../background/chat-events/chat-events.service';

export interface SseEvent {
  data: string;
  type?: string;
}

@Injectable()
export class ChatStreamService {
  private readonly log = new Logger(ChatStreamService.name);

  constructor(private readonly chatEvents: ChatEventsService) {}

  createStream(userId: string): Observable<SseEvent> {
    const sub = this.chatEvents.createSubscriber();
    if (!sub) {
      return new Observable((observer) => {
        observer.next({ data: JSON.stringify({ error: 'SSE not available' }) });
        observer.complete();
      });
    }

    const channel = this.chatEvents.channelForUser(userId);
    const subject = new Subject<SseEvent>();

    sub.subscribe(channel).catch((err) => {
      this.log.error(`Subscribe failed: ${err}`);
      subject.complete();
    });

    sub.on('message', (_ch: string, raw: string) => {
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

    subject.subscribe({
      complete: () => {
        void sub.unsubscribe(channel).then(() => sub.quit());
      },
    });

    return subject.asObservable();
  }
}
