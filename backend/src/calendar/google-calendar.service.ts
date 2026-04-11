import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, type calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

export type GoogleEventAttendee = {
  email: string;
  name: string | null;
  self: boolean;
  responseStatus: string;
};

export type GoogleEvent = {
  id: string;
  summary: string | null;
  start: Date;
  end: Date;
  location: string | null;
  status: string;
  attendees: GoogleEventAttendee[];
  isOrganizer: boolean;
};

@Injectable()
export class GoogleCalendarService {
  private readonly log = new Logger(GoogleCalendarService.name);

  constructor(private readonly config: ConfigService) {}

  private getOAuthClient(): OAuth2Client {
    return new google.auth.OAuth2(
      this.config.get<string>('googleCalendar.clientId'),
      this.config.get<string>('googleCalendar.clientSecret'),
      this.config.get<string>('googleCalendar.redirectUri'),
    );
  }

  /** URL the frontend opens so the user can grant calendar access. */
  getAuthUrl(userId: string, appRedirect?: string): string {
    const client = this.getOAuthClient();
    const statePayload = JSON.stringify({
      userId,
      appRedirect: appRedirect ?? '',
    });
    const state = Buffer.from(statePayload).toString('base64url');
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: ['https://www.googleapis.com/auth/calendar'],
      state,
    });
  }

  /** Decode the state parameter returned by Google in the callback. */
  decodeState(state: string): { userId: string; appRedirect: string } {
    try {
      const json = Buffer.from(state, 'base64url').toString('utf8');
      const parsed = JSON.parse(json) as {
        userId: string;
        appRedirect: string;
      };
      return { userId: parsed.userId, appRedirect: parsed.appRedirect ?? '' };
    } catch {
      return { userId: state, appRedirect: '' };
    }
  }

  /** Exchange the authorization code for tokens. */
  async exchangeCode(code: string): Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: Date;
    email: string | null;
  }> {
    const client = this.getOAuthClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.access_token || !tokens.refresh_token) {
      throw new Error('Google OAuth did not return required tokens');
    }
    client.setCredentials(tokens);

    let email: string | null = null;
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: client });
      const { data } = await oauth2.userinfo.get();
      email = data.email ?? null;
    } catch {
      this.log.warn('Could not fetch Google user email');
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expiry_date ?? Date.now() + 3600_000),
      email,
    };
  }

  /** Fetch events from ALL user calendars. Uses syncToken for incremental sync on primary. */
  async fetchEvents(
    accessToken: string,
    refreshToken: string,
    syncToken: string | null,
  ): Promise<{
    events: GoogleEvent[];
    nextSyncToken: string | null;
    newAccessToken: string | null;
    newExpiresAt: Date | null;
  }> {
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    let newAccessToken: string | null = null;
    let newExpiresAt: Date | null = null;
    client.on('tokens', (tokens) => {
      if (tokens.access_token) {
        newAccessToken = tokens.access_token;
        newExpiresAt = new Date(tokens.expiry_date ?? Date.now() + 3600_000);
      }
    });

    const cal = google.calendar({ version: 'v3', auth: client });

    const calendarIds = await this.listUserCalendarIds(cal);

    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const allEvents: GoogleEvent[] = [];
    let primarySyncToken: string | null = null;

    for (const calId of calendarIds) {
      const isPrimary = calId === 'primary';
      const params: calendar_v3.Params$Resource$Events$List = {
        calendarId: calId,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 250,
      };

      if (isPrimary && syncToken) {
        params.syncToken = syncToken;
      } else {
        params.timeMin = now.toISOString();
        params.timeMax = twoWeeks.toISOString();
      }

      try {
        const { data } = await cal.events.list(params);
        const parsed = this.parseEventItems(data.items ?? []);
        allEvents.push(...parsed);
        if (isPrimary) {
          primarySyncToken = data.nextSyncToken ?? null;
        }
      } catch (err: unknown) {
        const code =
          err && typeof err === 'object' && 'code' in err
            ? (err as { code: number }).code
            : 0;
        if (code === 410 && isPrimary) {
          this.log.log('Sync token expired, full sync for primary');
          const { data } = await cal.events.list({
            calendarId: 'primary',
            singleEvents: true,
            orderBy: 'startTime',
            maxResults: 250,
            timeMin: now.toISOString(),
            timeMax: twoWeeks.toISOString(),
          });
          allEvents.push(...this.parseEventItems(data.items ?? []));
          primarySyncToken = data.nextSyncToken ?? null;
        } else if (code !== 404) {
          this.log.warn(`Failed to fetch events from calendar ${calId}`);
        }
      }
    }

    return {
      events: allEvents,
      nextSyncToken: primarySyncToken,
      newAccessToken,
      newExpiresAt,
    };
  }

  private async listUserCalendarIds(
    cal: ReturnType<typeof google.calendar>,
  ): Promise<string[]> {
    try {
      const { data } = await cal.calendarList.list({ minAccessRole: 'reader' });
      const ids = (data.items ?? [])
        .filter((c) => !c.deleted)
        .map((c) => c.id!)
        .filter(Boolean);
      return ids.length > 0 ? ids : ['primary'];
    } catch {
      return ['primary'];
    }
  }

  private static readonly SKIP_EVENT_TYPES = new Set([
    'workingLocation',
    'outOfOffice',
    'focusTime',
  ]);

  private static readonly NOISE_TITLES = new Set([
    'home',
    'wfh',
    'work from home',
    'office',
    'remote',
    'commute',
  ]);

  private parseEventItems(items: calendar_v3.Schema$Event[]): GoogleEvent[] {
    return items
      .filter((e) => {
        if (!e.id || !(e.start?.dateTime || e.start?.date)) return false;
        if (
          e.eventType &&
          GoogleCalendarService.SKIP_EVENT_TYPES.has(e.eventType)
        )
          return false;
        if (!e.summary?.trim()) return false;
        if (
          GoogleCalendarService.NOISE_TITLES.has(e.summary.trim().toLowerCase())
        )
          return false;
        const selfAttendee = e.attendees?.find((a) => a.self);
        if (selfAttendee?.responseStatus === 'declined') return false;
        return true;
      })
      .map((e) => ({
        id: e.id!,
        summary: e.summary ?? null,
        start: new Date(e.start!.dateTime ?? e.start!.date!),
        end: new Date(
          e.end?.dateTime ?? e.end?.date ?? e.start!.dateTime ?? e.start!.date!,
        ),
        location: e.location ?? null,
        status: e.status ?? 'confirmed',
        attendees: (e.attendees ?? []).map((a) => ({
          email: a.email ?? '',
          name: a.displayName ?? null,
          self: a.self ?? false,
          responseStatus: a.responseStatus ?? 'needsAction',
        })),
        isOrganizer: e.organizer?.self === true,
      }));
  }

  /** Create an event on Google Calendar. Returns the created event ID. */
  async createEvent(
    accessToken: string,
    refreshToken: string,
    event: {
      summary: string;
      start: Date;
      end: Date;
      location?: string;
      description?: string;
      attendees?: { email: string }[];
    },
  ): Promise<{ eventId: string; newAccessToken: string | null }> {
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    let newAccessToken: string | null = null;
    client.on('tokens', (tokens) => {
      if (tokens.access_token) newAccessToken = tokens.access_token;
    });

    const cal = google.calendar({ version: 'v3', auth: client });
    const { data } = await cal.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: event.summary,
        start: { dateTime: event.start.toISOString() },
        end: { dateTime: event.end.toISOString() },
        location: event.location,
        description: event.description,
        attendees: event.attendees,
      },
    });

    if (!data.id) throw new Error('Google Calendar did not return event ID');
    return { eventId: data.id, newAccessToken };
  }

  /** Update an existing event on Google Calendar. */
  async updateEvent(
    accessToken: string,
    refreshToken: string,
    eventId: string,
    patch: {
      summary?: string;
      start?: Date;
      end?: Date;
      location?: string;
    },
  ): Promise<{ newAccessToken: string | null }> {
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    let newAccessToken: string | null = null;
    client.on('tokens', (tokens) => {
      if (tokens.access_token) newAccessToken = tokens.access_token;
    });

    const cal = google.calendar({ version: 'v3', auth: client });
    const body: calendar_v3.Schema$Event = {};
    if (patch.summary !== undefined) body.summary = patch.summary;
    if (patch.start) body.start = { dateTime: patch.start.toISOString() };
    if (patch.end) body.end = { dateTime: patch.end.toISOString() };
    if (patch.location !== undefined) body.location = patch.location;

    await cal.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: body,
    });

    return { newAccessToken };
  }

  /** Update RSVP status for the authenticated user on an event. */
  async rsvpEvent(
    accessToken: string,
    refreshToken: string,
    eventId: string,
    response: 'accepted' | 'declined' | 'tentative',
  ): Promise<{ newAccessToken: string | null }> {
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    let newAccessToken: string | null = null;
    client.on('tokens', (tokens) => {
      if (tokens.access_token) newAccessToken = tokens.access_token;
    });

    const cal = google.calendar({ version: 'v3', auth: client });
    const { data: event } = await cal.events.get({
      calendarId: 'primary',
      eventId,
    });

    const attendees = (event.attendees ?? []).map((a) =>
      a.self ? { ...a, responseStatus: response } : a,
    );

    await cal.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: { attendees },
    });

    return { newAccessToken };
  }

  /** Subscribe to push notifications for a calendar via Google's watch API. */
  async watchEvents(
    accessToken: string,
    refreshToken: string,
    calendarId: string,
    webhookUrl: string,
    channelId: string,
  ): Promise<{ resourceId: string; expiration: number }> {
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const cal = google.calendar({ version: 'v3', auth: client });
    const { data } = await cal.events.watch({
      calendarId,
      requestBody: {
        id: channelId,
        type: 'web_hook',
        address: webhookUrl,
      },
    });

    if (!data.resourceId || !data.expiration) {
      throw new Error('Google Calendar watch did not return resourceId/expiration');
    }

    return {
      resourceId: data.resourceId,
      expiration: Number(data.expiration),
    };
  }

  /** Stop an existing push notification channel. */
  async stopWatch(
    accessToken: string,
    refreshToken: string,
    channelId: string,
    resourceId: string,
  ): Promise<void> {
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const cal = google.calendar({ version: 'v3', auth: client });
    await cal.channels.stop({
      requestBody: { id: channelId, resourceId },
    });
  }

  /** Delete an event from Google Calendar. */
  async deleteEvent(
    accessToken: string,
    refreshToken: string,
    eventId: string,
  ): Promise<void> {
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    const cal = google.calendar({ version: 'v3', auth: client });
    await cal.events.delete({ calendarId: 'primary', eventId });
  }
}
