import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, isNotNull, lte, or } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  extractsTable,
  logsTable,
  type CalendarConnectionRow,
} from '../database/schemas';
import { CalendarConnectionService } from './calendar-connection.service';
import {
  GoogleCalendarService,
  type GoogleEvent,
} from './google-calendar.service';

@Injectable()
export class CalendarSyncService {
  private readonly log = new Logger(CalendarSyncService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly connections: CalendarConnectionService,
    private readonly google: GoogleCalendarService,
  ) {}

  /** Sync a single Google Calendar connection: fetch events, upsert extracts. */
  async syncGoogleConnection(connectionId: string): Promise<void> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.provider !== 'google') return;
    if (!conn.googleAccessToken || !conn.googleRefreshToken) {
      this.log.warn(`Connection ${connectionId} missing Google tokens`);
      return;
    }

    try {
      const result = await this.google.fetchEvents(
        conn.googleAccessToken,
        conn.googleRefreshToken,
        conn.syncCursor,
      );

      if (result.newAccessToken) {
        await this.connections.updateGoogleTokens(
          connectionId,
          result.newAccessToken,
          result.newExpiresAt ?? new Date(Date.now() + 3600_000),
        );
      }

      for (const event of result.events) {
        await this.upsertCalendarExtract(conn, event);
      }

      await this.connections.updateSyncState(
        connectionId,
        result.nextSyncToken,
      );

      await this.logCalendar(conn.userId, connectionId, 'sync_done', {
        eventCount: result.events.length,
        incremental: !!conn.syncCursor,
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown calendar sync error';
      this.log.error(`Google sync failed for ${connectionId}: ${msg}`);
      await this.logCalendar(
        conn.userId,
        connectionId,
        'sync_failed',
        {},
        { message: msg },
      );
      throw err;
    }
  }

  /** Receive Apple Calendar events from the device and upsert extracts. */
  async syncAppleEvents(
    userId: string,
    connectionId: string,
    events: {
      id: string;
      title: string;
      startDate: string;
      endDate: string;
      location?: string;
      status?: string;
    }[],
  ): Promise<number> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.userId !== userId || conn.provider !== 'apple') return 0;

    let count = 0;
    for (const ev of events) {
      const gEvent: GoogleEvent = {
        id: ev.id,
        summary: ev.title,
        start: new Date(ev.startDate),
        end: new Date(ev.endDate),
        location: ev.location ?? null,
        status: ev.status ?? 'confirmed',
      };
      await this.upsertCalendarExtract(conn, gEvent);
      count++;
    }

    await this.connections.updateSyncState(connectionId, null);
    await this.logCalendar(conn.userId, connectionId, 'apple_sync_done', {
      eventCount: count,
    });
    return count;
  }

  /** Auto-done: mark past calendar extracts as done. */
  async autoDonePastEvents(): Promise<number> {
    const now = new Date();
    const rows = await this.db
      .update(extractsTable)
      .set({ status: 'done', doneAt: now, updatedAt: now })
      .where(
        and(
          eq(extractsTable.source, 'calendar'),
          eq(extractsTable.status, 'inbox'),
          isNotNull(extractsTable.eventEndAt),
          lte(extractsTable.eventEndAt, now),
        ),
      )
      .returning({ id: extractsTable.id, userId: extractsTable.userId });

    if (rows.length > 0) {
      this.log.log(`Auto-done ${rows.length} past calendar events`);
      for (const row of rows) {
        await this.db.insert(logsTable).values({
          userId: row.userId,
          type: 'calendar',
          extractId: row.id,
          isAgent: true,
          pemNote: 'auto_done_past_calendar_event',
          payload: {
            op: 'auto_done_calendar',
            source: 'cron',
          },
        });
      }
    }
    return rows.length;
  }

  /** Delete an event from the user's Google Calendar. */
  async deleteFromGoogleCalendar(
    connectionId: string,
    externalEventId: string,
  ): Promise<boolean> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.provider !== 'google') return false;
    if (!conn.googleAccessToken || !conn.googleRefreshToken) return false;

    try {
      await this.google.deleteEvent(
        conn.googleAccessToken,
        conn.googleRefreshToken,
        externalEventId,
      );
      return true;
    } catch (err: unknown) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code: number }).code
          : 0;
      if (code === 404) {
        this.log.debug(`Calendar event already removed (${externalEventId})`);
        return true;
      }
      const msg = err instanceof Error ? err.message : 'Calendar delete failed';
      this.log.warn(`Failed to delete event ${externalEventId}: ${msg}`);
      return false;
    }
  }

  /** Write a new event to the user's primary Google Calendar. */
  async writeToGoogleCalendar(
    userId: string,
    event: {
      summary: string;
      start: Date;
      end: Date;
      location?: string;
      description?: string;
    },
  ): Promise<{ eventId: string; connectionId: string } | null> {
    const primary = await this.connections.getPrimary(userId);
    if (!primary || primary.provider !== 'google') return null;
    if (!primary.googleAccessToken || !primary.googleRefreshToken) return null;

    const result = await this.google.createEvent(
      primary.googleAccessToken,
      primary.googleRefreshToken,
      event,
    );

    if (result.newAccessToken) {
      await this.connections.updateGoogleTokens(
        primary.id,
        result.newAccessToken,
        new Date(Date.now() + 3600_000),
      );
    }

    return { eventId: result.eventId, connectionId: primary.id };
  }

  private async upsertCalendarExtract(
    conn: CalendarConnectionRow,
    event: GoogleEvent,
  ): Promise<void> {
    if (event.status === 'cancelled') {
      const cancelled = await this.db
        .update(extractsTable)
        .set({
          status: 'dismissed',
          dismissedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(extractsTable.calendarConnectionId, conn.id),
            eq(extractsTable.externalEventId, event.id),
          ),
        )
        .returning({ id: extractsTable.id });
      for (const row of cancelled) {
        await this.logCalendarExtract(
          conn.userId,
          conn.id,
          row.id,
          'calendar_sync_event_cancelled',
          {
            external_event_id: event.id,
          },
        );
      }
      return;
    }

    const [existing] = await this.db
      .select({ id: extractsTable.id })
      .from(extractsTable)
      .where(
        and(
          eq(extractsTable.userId, conn.userId),
          or(
            and(
              eq(extractsTable.calendarConnectionId, conn.id),
              eq(extractsTable.externalEventId, event.id),
            ),
            and(eq(extractsTable.externalEventId, event.id)),
            and(
              eq(extractsTable.extractText, event.summary ?? ''),
              eq(extractsTable.eventStartAt, event.start),
            ),
          ),
        ),
      )
      .limit(1);

    const now = new Date();
    const isPast = event.end < now;

    if (existing) {
      await this.db
        .update(extractsTable)
        .set({
          extractText: event.summary ?? 'Calendar event',
          eventStartAt: event.start,
          eventEndAt: event.end,
          eventLocation: event.location,
          externalEventId: event.id,
          calendarConnectionId: conn.id,
          status: isPast ? 'done' : 'inbox',
          doneAt: isPast ? now : null,
          updatedAt: now,
        })
        .where(eq(extractsTable.id, existing.id));
      await this.logCalendarExtract(
        conn.userId,
        conn.id,
        existing.id,
        'calendar_sync_event_updated',
        {
          external_event_id: event.id,
          summary: event.summary ?? null,
          is_past: isPast,
          event_start_at: event.start.toISOString(),
          event_end_at: event.end.toISOString(),
        },
      );
    } else {
      const [inserted] = await this.db
        .insert(extractsTable)
        .values({
          userId: conn.userId,
          source: 'calendar',
          extractText: event.summary ?? 'Calendar event',
          originalText: event.summary ?? '',
          status: isPast ? 'done' : 'inbox',
          tone: 'confident',
          urgency: this.classifyEventUrgency(event.start),
          externalEventId: event.id,
          calendarConnectionId: conn.id,
          eventStartAt: event.start,
          eventEndAt: event.end,
          eventLocation: event.location,
          doneAt: isPast ? now : null,
          updatedAt: now,
        })
        .returning({ id: extractsTable.id });
      if (inserted) {
        await this.logCalendarExtract(
          conn.userId,
          conn.id,
          inserted.id,
          'calendar_sync_event_created',
          {
            external_event_id: event.id,
            summary: event.summary ?? null,
            is_past: isPast,
            event_start_at: event.start.toISOString(),
            event_end_at: event.end.toISOString(),
          },
        );
      }
    }
  }

  private classifyEventUrgency(
    start: Date,
  ): 'today' | 'this_week' | 'someday' | 'none' {
    const now = new Date();
    const diffMs = start.getTime() - now.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    if (diffDays < 1) return 'today';
    if (diffDays < 7) return 'this_week';
    return 'none';
  }

  private async logCalendar(
    userId: string,
    connectionId: string,
    note: string,
    payload: Record<string, unknown>,
    error?: { message: string },
  ): Promise<void> {
    await this.db.insert(logsTable).values({
      userId,
      type: 'calendar',
      isAgent: true,
      pemNote: note,
      payload: { ...payload, connectionId },
      error: error ?? null,
    });
  }

  /** Per-extract audit for sync upserts (shows on item history). */
  private async logCalendarExtract(
    userId: string,
    connectionId: string,
    extractId: string,
    op: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.db.insert(logsTable).values({
      userId,
      type: 'calendar',
      extractId,
      isAgent: true,
      pemNote: op,
      payload: { op, connectionId, ...payload },
    });
  }
}
