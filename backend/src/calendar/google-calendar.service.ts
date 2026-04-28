import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, type calendar_v3 } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

import {
  signGoogleOAuthState,
  verifyGoogleOAuthState,
} from '@/calendar/sign-google-oauth-state';

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
  description: string | null;
  status: string;
  attendees: GoogleEventAttendee[];
  isOrganizer: boolean;
  organizerEmail: string | null;
  organizerName: string | null;
  selfRsvpStatus: string | null;
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
    const secret = this.config
      .get<string>('googleCalendar.oauthStateSecret')
      ?.trim();
    if (!secret) {
      throw new Error(
        'GOOGLE_OAUTH_STATE_SECRET is required for calendar OAuth (signs the state parameter)',
      );
    }
    const client = this.getOAuthClient();
    const state = signGoogleOAuthState(secret, userId, appRedirect ?? '');
    return client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: true,
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/contacts.readonly',
      ],
      state,
    });
  }

  /** Decode and verify the state parameter returned by Google in the callback. */
  decodeState(state: string): { userId: string; appRedirect: string } {
    const secret = this.config
      .get<string>('googleCalendar.oauthStateSecret')
      ?.trim();
    if (!secret) {
      throw new Error(
        'GOOGLE_OAUTH_STATE_SECRET is required to verify calendar OAuth state',
      );
    }
    return verifyGoogleOAuthState(secret, state);
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
        showDeleted: true,
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
            showDeleted: true,
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

  async fetchTodayBirthdays(
    accessToken: string,
    refreshToken: string,
  ): Promise<{ names: string[]; newAccessToken: string | null }> {
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
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dayEnd = new Date(dayStart.getTime() + 86_400_000);

    try {
      const { data } = await cal.calendarList.list({ minAccessRole: 'reader' });
      const birthdayCal = (data.items ?? []).find((c) =>
        (c.id ?? '').endsWith('#contacts@group.v.calendar.google.com'),
      );
      if (!birthdayCal?.id) return { names: [], newAccessToken };

      const { data: events } = await cal.events.list({
        calendarId: birthdayCal.id,
        singleEvents: true,
        timeMin: dayStart.toISOString(),
        timeMax: dayEnd.toISOString(),
        maxResults: 50,
      });

      const names = (events.items ?? [])
        .map((e) => e.summary?.replace(/'s birthday$/i, '').trim() ?? '')
        .filter(Boolean);

      return { names, newAccessToken };
    } catch {
      return { names: [], newAccessToken };
    }
  }

  private static readonly SKIP_CALENDAR_SUFFIXES = [
    '#holiday@group.v.calendar.google.com',
    '#contacts@group.v.calendar.google.com',
    '#weeknum@group.v.calendar.google.com',
    '#weather@group.v.calendar.google.com',
  ];

  private async listUserCalendarIds(
    cal: ReturnType<typeof google.calendar>,
  ): Promise<string[]> {
    try {
      const { data } = await cal.calendarList.list({ minAccessRole: 'reader' });
      const ids = (data.items ?? [])
        .filter((c) => {
          if (c.deleted) return false;
          const id = c.id ?? '';
          return !GoogleCalendarService.SKIP_CALENDAR_SUFFIXES.some((s) =>
            id.endsWith(s),
          );
        })
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
      .map((e) => {
        const selfAttendee = e.attendees?.find((a) => a.self);
        return {
          id: e.id!,
          summary: e.summary ?? null,
          start: new Date(e.start!.dateTime ?? e.start!.date!),
          end: new Date(
            e.end?.dateTime ??
              e.end?.date ??
              e.start!.dateTime ??
              e.start!.date!,
          ),
          location: e.location ?? null,
          description: e.description ?? null,
          status: e.status ?? 'confirmed',
          attendees: (e.attendees ?? []).map((a) => ({
            email: a.email ?? '',
            name: a.displayName ?? null,
            self: a.self ?? false,
            responseStatus: a.responseStatus ?? 'needsAction',
          })),
          isOrganizer: e.organizer?.self === true,
          organizerEmail: e.organizer?.email ?? null,
          organizerName: e.organizer?.displayName ?? null,
          selfRsvpStatus: selfAttendee?.responseStatus ?? null,
        };
      });
  }

  /** Create an event on Google Calendar. Returns the created event ID. */
  async createEvent(
    accessToken: string,
    refreshToken: string,
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
    const hasGuests = event.attendees && event.attendees.length > 0;

    const requestBody: calendar_v3.Schema$Event = {
      summary: event.summary,
      location: event.location,
      description: event.description,
      attendees: event.attendees,
      recurrence: event.recurrence,
    };

    if (event.reminderMinutes != null) {
      requestBody.reminders = {
        useDefault: false,
        overrides: [{ method: 'popup', minutes: event.reminderMinutes }],
      };
    }

    if (event.isAllDay) {
      const toDateStr = (d: Date) => d.toISOString().slice(0, 10);
      requestBody.start = { date: toDateStr(event.start) };
      const endExclusive = new Date(event.end);
      endExclusive.setDate(endExclusive.getDate() + 1);
      requestBody.end = { date: toDateStr(endExclusive) };
    } else {
      requestBody.start = { dateTime: event.start.toISOString() };
      requestBody.end = { dateTime: event.end.toISOString() };
    }

    const { data } = await cal.events.insert({
      calendarId: 'primary',
      sendUpdates: hasGuests ? 'all' : 'none',
      requestBody,
    });

    if (!data.id) throw new Error('Google Calendar did not return event ID');
    return { eventId: data.id, newAccessToken };
  }

  /** Fetch the user's Google Contacts via People API. */
  async fetchContacts(
    accessToken: string,
    refreshToken: string,
  ): Promise<{
    contacts: { email: string; name: string | null }[];
    newAccessToken: string | null;
  }> {
    const client = this.getOAuthClient();
    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    let newAccessToken: string | null = null;
    client.on('tokens', (tokens) => {
      if (tokens.access_token) newAccessToken = tokens.access_token;
    });

    const people = google.people({ version: 'v1', auth: client });
    const contacts: { email: string; name: string | null }[] = [];
    let pageToken: string | undefined;

    do {
      const res = await people.people.connections.list({
        resourceName: 'people/me',
        pageSize: 1000,
        personFields: 'names,emailAddresses',
        pageToken,
      });

      for (const person of res.data.connections ?? []) {
        const email = person.emailAddresses?.[0]?.value;
        if (!email) continue;
        const name = person.names?.[0]?.displayName ?? null;
        contacts.push({ email: email.toLowerCase(), name });
      }

      pageToken = res.data.nextPageToken ?? undefined;
    } while (pageToken);

    return { contacts, newAccessToken };
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

  /** Query Google Calendar free/busy for the primary calendar. */
  async queryFreeBusy(
    accessToken: string,
    refreshToken: string,
    timeMin: Date,
    timeMax: Date,
  ): Promise<{
    busyBlocks: { start: Date; end: Date }[];
    newAccessToken: string | null;
  }> {
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
    const { data } = await cal.freebusy.query({
      requestBody: {
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        items: [{ id: 'primary' }],
      },
    });

    const busy = data.calendars?.primary?.busy ?? [];
    const busyBlocks = busy
      .filter((b) => b.start && b.end)
      .map((b) => ({ start: new Date(b.start!), end: new Date(b.end!) }));

    return { busyBlocks, newAccessToken };
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
      throw new Error(
        'Google Calendar watch did not return resourceId/expiration',
      );
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
