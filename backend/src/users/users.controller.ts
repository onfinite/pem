import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { UserRow } from '../database/schemas';
import { PushTokenDto } from './dto/push-token.dto';
import { TimezoneDto } from './dto/timezone.dto';
import { UserMeDto } from './dto/user-me.dto';
import { UserService } from './user.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UserService) {}

  @Get('me')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Current user (Clerk JWT)' })
  @ApiResponse({ status: 200, description: 'Current user', type: UserMeDto })
  @ApiResponse({
    status: 401,
    description: 'Invalid or missing token / user not found',
  })
  @ApiResponse({
    status: 503,
    description: 'Clerk JWT not configured on server',
  })
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
    };
  }

  @Get('me/summary')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Get user profile summary' })
  async getSummary(@CurrentUser() user: UserRow) {
    return { summary: user.summary ?? null };
  }

  @Patch('me/summary')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Update user profile summary' })
  async updateSummary(
    @CurrentUser() user: UserRow,
    @Body() body: { summary: string },
  ) {
    await this.users.updateSummary(user.id, body.summary);
    return { ok: true };
  }

  @Patch('me/notification-time')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Set notification time for morning brief (HH:MM)' })
  async setNotificationTime(
    @CurrentUser() user: UserRow,
    @Body() body: { time: string },
  ) {
    await this.users.setNotificationTime(user.id, body.time);
    return { ok: true, notification_time: body.time };
  }

  @Post('me/onboarding-complete')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @HttpCode(200)
  @ApiOperation({ summary: 'Mark onboarding as complete' })
  async completeOnboarding(@CurrentUser() user: UserRow) {
    await this.users.completeOnboarding(user.id);
    return { ok: true };
  }

  @Patch('me/push-token')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Save or clear Expo push token' })
  async setPushToken(
    @CurrentUser() user: UserRow,
    @Body() body: PushTokenDto,
  ): Promise<{ ok: true }> {
    await this.users.setPushToken(user.id, body.token ?? null);
    return { ok: true };
  }

  @Patch('me/timezone')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Set IANA timezone (e.g. America/Los_Angeles)' })
  async setTimezone(
    @CurrentUser() user: UserRow,
    @Body() body: TimezoneDto,
  ): Promise<{ ok: true; timezone: string }> {
    await this.users.setTimezone(user.id, body.timezone);
    return { ok: true, timezone: body.timezone };
  }
}
