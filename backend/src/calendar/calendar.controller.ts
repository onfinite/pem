import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { CalendarConnectionService } from './calendar-connection.service';
import { CalendarSyncService } from './calendar-sync.service';
import { GoogleCalendarService } from './google-calendar.service';
import { AppleConnectDto, AppleSyncDto } from './dto/apple-sync.dto';

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(
    private readonly connections: CalendarConnectionService,
    private readonly googleCal: GoogleCalendarService,
    private readonly sync: CalendarSyncService,
  ) {}

  // ── Connections ────────────────────────────────────────────

  @Get('connections')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'List calendar connections' })
  async list(@CurrentUser() user: UserRow) {
    const rows = await this.connections.listForUser(user.id);
    return {
      connections: rows.map((c) => ({
        id: c.id,
        provider: c.provider,
        is_primary: c.isPrimary,
        google_email: c.googleEmail,
        apple_calendar_ids: c.appleCalendarIds,
        last_synced_at: c.lastSyncedAt?.toISOString() ?? null,
      })),
    };
  }

  @Patch('connections/:id/primary')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Set a calendar connection as primary' })
  async setPrimary(@CurrentUser() user: UserRow, @Param('id') id: string) {
    await this.connections.setPrimary(user.id, id);
    return { ok: true };
  }

  @Delete('connections/apple')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Disconnect Apple Calendar' })
  async disconnectApple(@CurrentUser() user: UserRow) {
    await this.connections.disconnect(user.id, 'apple');
    return { ok: true };
  }

  @Delete('connections/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Disconnect a specific calendar connection by ID' })
  async disconnectById(@CurrentUser() user: UserRow, @Param('id') id: string) {
    await this.connections.disconnectById(user.id, id);
    return { ok: true };
  }

  // ── Sync all ─────────────────────────────────────────────

  @Post('sync-all')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Trigger sync for all calendar connections' })
  async syncAll(@CurrentUser() user: UserRow) {
    return this.sync.syncAllForUser(user.id);
  }

  // ── Google OAuth ──────────────────────────────────────────

  @Get('google/auth-url')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Get Google OAuth URL for calendar access' })
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
  @ApiOperation({ summary: 'Google OAuth callback (browser redirect)' })
  async googleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const { userId, appRedirect } = this.googleCal.decodeState(state);

    try {
      const tokens = await this.googleCal.exchangeCode(code);
      await this.connections.upsertGoogle(userId, tokens);

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

  // ── Apple Calendar ────────────────────────────────────────

  @Post('apple/connect')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({
    summary: 'Register Apple Calendar connection with selected calendar IDs',
  })
  async connectApple(
    @CurrentUser() user: UserRow,
    @Body() body: AppleConnectDto,
  ) {
    const conn = await this.connections.upsertApple(user.id, body.calendarIds);
    return {
      id: conn.id,
      provider: conn.provider,
      is_primary: conn.isPrimary,
    };
  }

  @Post('apple/sync')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Sync Apple Calendar events from device' })
  async syncApple(@CurrentUser() user: UserRow, @Body() body: AppleSyncDto) {
    const count = await this.sync.syncAppleEvents(
      user.id,
      body.connectionId,
      body.events,
    );
    return { synced: count };
  }
}
