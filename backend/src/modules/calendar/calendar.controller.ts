import { InjectQueue } from '@nestjs/bullmq';
import {
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import type { Response } from 'express';

import { ClerkAuthGuard } from '@/core/auth/clerk-auth.guard';
import { CurrentUser } from '@/core/auth/current-user.decorator';
import type { UserRow } from '@/database/schemas/index';
import { CalendarConnectionService } from '@/modules/calendar/services/calendar-connection.service';
import { CalendarSyncService } from '@/modules/calendar/services/calendar-sync.service';
import { GoogleCalendarService } from '@/modules/calendar/services/google-calendar.service';
import { logWithContext } from '@/core/utils/format-log-context';

@Controller('calendar')
export class CalendarController {
  private readonly log = new Logger(CalendarController.name);

  constructor(
    private readonly connections: CalendarConnectionService,
    private readonly googleCal: GoogleCalendarService,
    private readonly sync: CalendarSyncService,
    @InjectQueue('calendar-sync') private readonly calendarQueue: Queue,
  ) {}

  // ── Connections ────────────────────────────────────────────

  @Get('connections')
  @UseGuards(ClerkAuthGuard)
  async list(@CurrentUser() user: UserRow) {
    const rows = await this.connections.listForUser(user.id);
    return {
      connections: rows.map((c) => ({
        id: c.id,
        provider: c.provider,
        is_primary: c.isPrimary,
        google_email: c.googleEmail,
        last_synced_at: c.lastSyncedAt?.toISOString() ?? null,
      })),
    };
  }

  @Patch('connections/:id/primary')
  @UseGuards(ClerkAuthGuard)
  async setPrimary(@CurrentUser() user: UserRow, @Param('id') id: string) {
    await this.connections.setPrimary(user.id, id);
    return { ok: true };
  }

  @Delete('connections/:id')
  @UseGuards(ClerkAuthGuard)
  async disconnectById(@CurrentUser() user: UserRow, @Param('id') id: string) {
    await this.connections.disconnectById(user.id, id);
    return { ok: true };
  }

  // ── Sync all ─────────────────────────────────────────────

  @Post('sync-all')
  @UseGuards(ClerkAuthGuard)
  async syncAll(@CurrentUser() user: UserRow) {
    return this.sync.syncAllForUser(user.id);
  }

  // ── Google OAuth ──────────────────────────────────────────

  @Get('google/auth-url')
  @UseGuards(ClerkAuthGuard)
  getGoogleAuthUrl(
    @CurrentUser() user: UserRow,
    @Query('appRedirect') appRedirect?: string,
  ) {
    const url = this.googleCal.getAuthUrl(user.id, appRedirect);
    return { url };
  }

  /**
   * Google redirects here after user consent.
   * No auth guard — browser redirect, not an API call.
   * After token exchange, redirects to the app scheme so
   * openAuthSessionAsync detects it and closes the browser.
   */
  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    let userId: string;
    let appRedirect: string;
    try {
      ({ userId, appRedirect } = this.googleCal.decodeState(state));
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : 'Invalid or expired OAuth state';
      return res
        .status(400)
        .send(
          `<html><body style="background:#141410;color:#FAFAF8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;"><div><h2 style="color:#ff453a;">Link failed</h2><p>${msg}</p></div></body></html>`,
        );
    }

    try {
      const tokens = await this.googleCal.exchangeCode(code);
      const conn = await this.connections.upsertGoogle(userId, tokens);
      void this.sync.setupWatch(conn.id).catch((err) => {
        this.log.warn(
          logWithContext('Watch setup after OAuth failed', {
            userId,
            connectionId: conn.id,
            scope: 'calendar_oauth',
            err: err instanceof Error ? err.message : 'unknown',
          }),
        );
      });

      if (appRedirect) {
        const sep = appRedirect.includes('?') ? '&' : '?';
        res.redirect(`${appRedirect}${sep}status=connected`);
      } else {
        res.send(
          '<html><body style="background:#141410;color:#FAFAF8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;"><div><h2 style="color:#e8763a;">Connected!</h2><p>Google Calendar is linked. You can close this window and return to Pem.</p></div></body></html>',
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (appRedirect) {
        const sep = appRedirect.includes('?') ? '&' : '?';
        res.redirect(
          `${appRedirect}${sep}status=error&message=${encodeURIComponent(msg)}`,
        );
      } else {
        res
          .status(500)
          .send(
            `<html><body style="background:#141410;color:#FAFAF8;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;"><div><h2 style="color:#ff453a;">Connection failed</h2><p>${msg}</p></div></body></html>`,
          );
      }
    }
  }

  // ── Google push notification webhook ───────────────────────

  @Post('webhook')
  @HttpCode(200)
  async googleWebhook(
    @Headers('x-goog-channel-id') channelId?: string,
    @Headers('x-goog-resource-id') resourceId?: string,
  ) {
    if (!channelId || !resourceId) return { ok: true };

    const conn = await this.connections.findByWatchChannelId(channelId);
    if (!conn) {
      this.log.warn(
        logWithContext('Calendar webhook for unknown channel', {
          channelId,
          resourceId,
          scope: 'calendar_webhook',
        }),
      );
      return { ok: true };
    }

    await this.calendarQueue.add(
      'sync',
      { connectionId: conn.id },
      {
        jobId: `cal-webhook-${conn.id}-${Date.now()}`,
        removeOnComplete: true,
        removeOnFail: 50,
        attempts: 2,
        backoff: { type: 'exponential', delay: 2000 },
      },
    );

    return { ok: true };
  }
}
