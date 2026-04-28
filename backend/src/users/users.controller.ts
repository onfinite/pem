import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';

import { ClerkAuthGuard } from '@/auth/clerk-auth.guard';
import { CurrentUser } from '@/auth/current-user.decorator';
import type { UserRow } from '@/database/schemas/index';
import { NotificationTimeDto } from '@/users/dto/notification-time.dto';
import { PreferencesDto } from '@/users/dto/preferences.dto';
import { PushTokenDto } from '@/users/dto/push-token.dto';
import { TimezoneDto } from '@/users/dto/timezone.dto';
import { UpdateNameDto } from '@/users/dto/update-name.dto';
import { UpdateSummaryDto } from '@/users/dto/update-summary.dto';
import { UserService } from '@/users/user.service';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UserService) {}

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  getMe(@CurrentUser() user: UserRow) {
    return {
      id: user.id,
      clerk_id: user.clerkId,
      email: user.email,
      name: user.name,
      push_token: user.pushToken,
      timezone: user.timezone,
      notification_time: user.notificationTime,
      summary: user.summary ?? null,
      onboarding_completed: user.onboardingCompleted,
      preferences: user.preferences ?? null,
      scheduling_confidence: user.schedulingConfidence ?? null,
    };
  }

  @Get('me/summary')
  @UseGuards(ClerkAuthGuard)
  getSummary(@CurrentUser() user: UserRow) {
    return { summary: user.summary ?? null };
  }

  @Patch('me/name')
  @UseGuards(ClerkAuthGuard)
  async setName(@CurrentUser() user: UserRow, @Body() body: UpdateNameDto) {
    await this.users.setName(user.id, body.name);
    return { ok: true, name: body.name.trim() };
  }

  @Patch('me/summary')
  @UseGuards(ClerkAuthGuard)
  async updateSummary(
    @CurrentUser() user: UserRow,
    @Body() body: UpdateSummaryDto,
  ) {
    await this.users.updateSummary(user.id, body.summary);
    return { ok: true };
  }

  @Patch('me/notification-time')
  @UseGuards(ClerkAuthGuard)
  async setNotificationTime(
    @CurrentUser() user: UserRow,
    @Body() body: NotificationTimeDto,
  ) {
    await this.users.setNotificationTime(user.id, body.time);
    return { ok: true, notification_time: body.time };
  }

  @Post('me/onboarding-complete')
  @UseGuards(ClerkAuthGuard)
  @HttpCode(200)
  async completeOnboarding(@CurrentUser() user: UserRow) {
    await this.users.completeOnboarding(user.id);
    return { ok: true };
  }

  @Patch('me/push-token')
  @UseGuards(ClerkAuthGuard)
  async setPushToken(
    @CurrentUser() user: UserRow,
    @Body() body: PushTokenDto,
  ): Promise<{ ok: true }> {
    await this.users.setPushToken(user.id, body.token ?? null);
    return { ok: true };
  }

  @Patch('me/preferences')
  @UseGuards(ClerkAuthGuard)
  async setPreferences(
    @CurrentUser() user: UserRow,
    @Body() body: PreferencesDto,
  ) {
    await this.users.setPreferences(user.id, body);
    return { ok: true };
  }

  @Patch('me/timezone')
  @UseGuards(ClerkAuthGuard)
  async setTimezone(
    @CurrentUser() user: UserRow,
    @Body() body: TimezoneDto,
  ): Promise<{ ok: true; timezone: string }> {
    await this.users.setTimezone(user.id, body.timezone);
    return { ok: true, timezone: body.timezone };
  }

  @Delete('me')
  @UseGuards(ClerkAuthGuard)
  @HttpCode(204)
  async deleteAccount(@CurrentUser() user: UserRow) {
    await this.users.deleteAccount(user.id);
  }
}
