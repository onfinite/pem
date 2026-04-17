import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { and, eq, isNotNull, lte, or, sql } from 'drizzle-orm';

import { DRIZZLE } from '../database/database.constants';
import type { DrizzleDb } from '../database/database.module';
import {
  calendarConnectionsTable,
  contactsTable,
  extractsTable,
  logsTable,
  messagesTable,
  type CalendarConnectionRow,
} from '../database/schemas';
import { ChatEventsService } from '../background/chat-events/chat-events.service';
import { CalendarConnectionService } from './calendar-connection.service';
import {
  GoogleCalendarService,
  type GoogleEvent,
} from './google-calendar.service';

@Injectable()
export class CalendarSyncService {
  private readonly log = new Logger(CalendarSyncService.name);
  private readonly contactSyncWarned = new Set<string>();
  private readonly lastContactSync = new Map<string, number>();
  private static readonly CONTACT_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDb,
    private readonly config: ConfigService,
    private readonly connections: CalendarConnectionService,
    private readonly google: GoogleCalendarService,
    private readonly chatEvents: ChatEventsService,
  ) {}

  async syncAllForUser(userId: string): Promise<{ synced: boolean }> {
    const conns = await this.connections.listForUser(userId);
    for (const conn of conns) {
      if (conn.provider === 'google') {
        try {
          await this.syncGoogleConnection(conn.id);
        } catch (err) {
          this.log.warn(
            `syncAllForUser: Google sync failed for ${conn.id}: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`,
          );
        }
      }
    }
    return { synced: true };
  }

  /** Set up a Google Calendar push notification watch for a connection. */
  async setupWatch(connectionId: string): Promise<void> {
    const webhookUrl = this.config.get<string>('googleCalendar.webhookUrl');
    if (!webhookUrl) {
      this.log.debug(
        'GOOGLE_CALENDAR_WEBHOOK_URL not set, skipping watch setup',
      );
      return;
    }

    const conn = await this.connections.findById(connectionId);
    if (!conn?.googleAccessToken || !conn.googleRefreshToken) return;

    const channelId = randomUUID();
    try {
      const { resourceId, expiration } = await this.google.watchEvents(
        conn.googleAccessToken,
        conn.googleRefreshToken,
        'primary',
        webhookUrl,
        channelId,
      );

      await this.connections.updateWatchState(
        connectionId,
        channelId,
        resourceId,
        new Date(expiration),
      );

      this.log.log(`Watch set up for connection ${connectionId}`);
    } catch (err) {
      this.log.warn(
        `Failed to set up watch for ${connectionId}: ${
          err instanceof Error ? err.message : 'Unknown error'
        }`,
      );
    }
  }

  /** Renew a watch by stopping the old one and creating a new one. */
  async renewWatch(connectionId: string): Promise<void> {
    const conn = await this.connections.findById(connectionId);
    if (!conn?.googleAccessToken || !conn.googleRefreshToken) return;

    if (conn.watchChannelId && conn.watchResourceId) {
      try {
        await this.google.stopWatch(
          conn.googleAccessToken,
          conn.googleRefreshToken,
          conn.watchChannelId,
          conn.watchResourceId,
        );
      } catch (err) {
        this.log.debug(
          `Stop watch failed for ${connectionId} (may already be expired): ${
            err instanceof Error ? err.message : 'unknown'
          }`,
        );
      }
    }

    await this.setupWatch(connectionId);
  }

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
        const upsertResult = await this.upsertCalendarExtract(conn, event);
        for (const att of event.attendees) {
          if (att.self || !att.email) continue;
          await this.upsertContact(
            conn.userId,
            att.email,
            att.name,
            event.start,
          );
        }
        if (upsertResult.isNewInvite && upsertResult.extractId) {
          await this.sendInviteNotification(
            conn.userId,
            upsertResult.extractId,
            event,
          ).catch((e) =>
            this.log.warn(
              `Invite notification failed: ${e instanceof Error ? e.message : String(e)}`,
            ),
          );
        }
      }

      await this.connections.updateSyncState(
        connectionId,
        result.nextSyncToken,
      );

      await this.db
        .update(calendarConnectionsTable)
        .set({
          connectionStatus: 'healthy',
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(calendarConnectionsTable.id, connectionId));

      await this.logCalendar(conn.userId, connectionId, 'sync_done', {
        eventCount: result.events.length,
        incremental: !!conn.syncCursor,
      });

      const lastSync = this.lastContactSync.get(connectionId) ?? 0;
      const contactSyncDue =
        Date.now() - lastSync > CalendarSyncService.CONTACT_SYNC_INTERVAL_MS;
      if (contactSyncDue) {
        await this.syncContacts(conn)
          .then(() => {
            this.lastContactSync.set(connectionId, Date.now());
            this.contactSyncWarned.delete(connectionId);
          })
          .catch((e) => {
            if (!this.contactSyncWarned.has(connectionId)) {
              this.contactSyncWarned.add(connectionId);
              this.log.warn(
                `Contact sync failed for ${connectionId}: ${e instanceof Error ? e.message : 'unknown'}`,
              );
            }
          });
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : 'Unknown calendar sync error';
      const code =
        err && typeof err === 'object' && 'code' in err
          ? (err as { code: number }).code
          : 0;

      if (code === 401 || code === 403) {
        this.log.warn(
          `OAuth failure for ${connectionId}, marking disconnected`,
        );
        await this.db
          .update(calendarConnectionsTable)
          .set({
            connectionStatus: 'disconnected',
            lastError: msg,
            updatedAt: new Date(),
          })
          .where(eq(calendarConnectionsTable.id, connectionId));
      } else {
        await this.db
          .update(calendarConnectionsTable)
          .set({
            connectionStatus: 'error',
            lastError: msg,
            updatedAt: new Date(),
          })
          .where(eq(calendarConnectionsTable.id, connectionId));
      }

      this.log.error(`Google sync failed for ${connectionId}: ${msg}`);
      await this.logCalendar(
        conn.userId,
        connectionId,
        'sync_failed',
        { code },
        { message: msg },
      );
      throw err;
    }
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

      await this.logCalendarOp(conn.userId, 'calendar_event_deleted', {
        connectionId,
        externalEventId,
      });

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

  /** Update RSVP status on a Google Calendar event. */
  async rsvpOnGoogle(
    connectionId: string,
    externalEventId: string,
    response: 'accepted' | 'declined' | 'tentative',
  ): Promise<void> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.provider !== 'google') return;
    if (!conn.googleAccessToken || !conn.googleRefreshToken) return;

    const result = await this.google.rsvpEvent(
      conn.googleAccessToken,
      conn.googleRefreshToken,
      externalEventId,
      response,
    );

    if (result.newAccessToken) {
      await this.connections.updateGoogleTokens(
        conn.id,
        result.newAccessToken,
        new Date(Date.now() + 3600_000),
      );
    }

    await this.logCalendarOp(conn.userId, 'calendar_rsvp', {
      connectionId,
      externalEventId,
      response,
    });
  }

  /** Write a new event to the user's primary Google Calendar. */
  async writeToGoogleCalendar(
    userId: string,
    event: {
      summary: string;
      start: Date;
      end: Date;
      isAllDay?: boolean;
      location?: string;
      description?: string;
      attendees?: { email: string }[];
      recurrence?: string[];
      reminderMinutes?: number;
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

    await this.logCalendarOp(userId, 'calendar_event_written', {
      summary: event.summary,
      start: event.start.toISOString(),
      end: event.end.toISOString(),
      eventId: result.eventId,
      connectionId: primary.id,
    });

    return { eventId: result.eventId, connectionId: primary.id };
  }

  async updateGoogleCalendarEvent(
    connectionId: string,
    externalEventId: string,
    updates: {
      summary?: string;
      start?: Date;
      end?: Date;
      location?: string;
      description?: string;
      attendees?: { email: string }[];
    },
  ): Promise<void> {
    const conn = await this.connections.findById(connectionId);
    if (!conn || conn.provider !== 'google') return;
    if (!conn.googleAccessToken) return;

    const body: Record<string, unknown> = {};
    if (updates.summary) body.summary = updates.summary;
    if (updates.location) body.location = updates.location;
    if (updates.description) body.description = updates.description;
    if (updates.start) {
      body.start = { dateTime: updates.start.toISOString() };
      body.end = { dateTime: (updates.end ?? updates.start).toISOString() };
    }
    if (updates.attendees) {
      body.attendees = updates.attendees.map((a) => ({ email: a.email }));
    }

    const patchUrl = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${externalEventId}`,
    );
    if (updates.attendees) patchUrl.searchParams.set('sendUpdates', 'all');

    const res = await fetch(patchUrl.toString(), {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${conn.googleAccessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text();
      this.log.warn(`Google Calendar update failed: ${res.status} ${txt}`);
    }

    await this.logCalendarOp(conn.userId, 'calendar_event_updated', {
      connectionId,
      externalEventId,
      updates,
    });
  }

  private async logCalendarOp(
    userId: string,
    op: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      await this.db.insert(logsTable).values({
        userId,
        type: 'calendar',
        pemNote: op,
        isAgent: true,
        payload,
      });
    } catch (e) {
      this.log.warn(
        `Log insert failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  private async upsertContact(
    userId: string,
    email: string,
    name: string | null,
    eventDate: Date,
  ): Promise<void> {
    try {
      await this.db
        .insert(contactsTable)
        .values({
          userId,
          email,
          name,
          meetingCount: 1,
          lastMetAt: eventDate,
          firstMetAt: eventDate,
        })
        .onConflictDoUpdate({
          target: [contactsTable.userId, contactsTable.email],
          set: {
            meetingCount: sql`${contactsTable.meetingCount} + 1`,
            lastMetAt: sql`GREATEST(${contactsTable.lastMetAt}, ${eventDate})`,
            name: sql`COALESCE(${name}, ${contactsTable.name})`,
            updatedAt: new Date(),
          },
        });
    } catch (e) {
      this.log.debug(
        `Contact upsert failed: ${e instanceof Error ? e.message : 'unknown'}`,
      );
    }
  }

  /** Import contacts from Google People API into the contacts table. */
  private async syncContacts(conn: CalendarConnectionRow): Promise<void> {
    if (!conn.googleAccessToken || !conn.googleRefreshToken) return;

    const result = await this.google.fetchContacts(
      conn.googleAccessToken,
      conn.googleRefreshToken,
    );

    if (result.newAccessToken) {
      await this.connections.updateGoogleTokens(
        conn.id,
        result.newAccessToken,
        new Date(Date.now() + 3600_000),
      );
    }

    for (const c of result.contacts) {
      try {
        await this.db
          .insert(contactsTable)
          .values({
            userId: conn.userId,
            email: c.email,
            name: c.name,
            meetingCount: 0,
          })
          .onConflictDoUpdate({
            target: [contactsTable.userId, contactsTable.email],
            set: {
              name: sql`COALESCE(${c.name}, ${contactsTable.name})`,
              updatedAt: new Date(),
            },
          });
      } catch {
        // individual upsert failure is non-fatal
      }
    }

    this.log.log(
      `Synced ${result.contacts.length} contacts for user ${conn.userId}`,
    );
  }

  private async upsertCalendarExtract(
    conn: CalendarConnectionRow,
    event: GoogleEvent,
  ): Promise<{
    isNewInvite: boolean;
    extractId: string | null;
  }> {
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
      return { isNewInvite: false, extractId: null };
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
          isOrganizer: event.isOrganizer ?? false,
          rsvpStatus: event.selfRsvpStatus ?? null,
          pemNote: event.description?.trim() || null,
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
      return { isNewInvite: false, extractId: existing.id };
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
          urgency: 'none',
          periodStart: event.start,
          periodEnd: event.end,
          periodLabel: this.periodLabelForEvent(event.start),
          externalEventId: event.id,
          calendarConnectionId: conn.id,
          isOrganizer: event.isOrganizer ?? false,
          rsvpStatus: event.selfRsvpStatus ?? null,
          eventStartAt: event.start,
          eventEndAt: event.end,
          eventLocation: event.location,
          pemNote: event.description?.trim() || null,
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

      const isNewInvite = !isPast && !event.isOrganizer && !!inserted;
      return { isNewInvite, extractId: inserted?.id ?? null };
    }
  }

  private async sendInviteNotification(
    userId: string,
    extractId: string,
    event: GoogleEvent,
  ): Promise<void> {
    const organizer = event.organizerName || event.organizerEmail || 'Someone';
    const time = event.start.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
    const parts = [
      `${organizer} invited you to "${event.summary}" on ${time}.`,
    ];
    if (event.location) parts.push(`Location: ${event.location}`);
    if (event.description) {
      const desc =
        event.description.length > 200
          ? event.description.slice(0, 200) + '...'
          : event.description;
      parts.push(desc);
    }

    const content = parts.join('\n');
    const [msg] = await this.db
      .insert(messagesTable)
      .values({
        userId,
        role: 'pem',
        kind: 'text',
        content,
        processingStatus: 'done',
        metadata: {
          type: 'calendar_invite',
          extract_id: extractId,
          event_summary: event.summary,
          event_start: event.start.toISOString(),
          event_end: event.end.toISOString(),
          event_location: event.location,
          organizer_name: event.organizerName,
          organizer_email: event.organizerEmail,
          self_rsvp_status: event.selfRsvpStatus,
        },
      })
      .returning();

    if (msg) {
      await this.chatEvents.publish(userId, 'pem_message', {
        message: {
          id: msg.id,
          role: msg.role,
          kind: msg.kind,
          content: msg.content,
          voice_url: null,
          transcript: null,
          triage_category: null,
          processing_status: msg.processingStatus,
          polished_text: null,
          summary: null,
          parent_message_id: null,
          metadata: msg.metadata,
          created_at: msg.createdAt.toISOString(),
        },
      });
    }
  }

  private periodLabelForEvent(start: Date): string {
    const now = new Date();
    const diffMs = start.getTime() - now.getTime();
    const diffDays = diffMs / (24 * 60 * 60 * 1000);
    if (diffDays < 1) return 'today';
    if (diffDays < 2) return 'tomorrow';
    if (diffDays < 7) return 'this week';
    if (diffDays < 14) return 'next week';
    return start.toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });
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
