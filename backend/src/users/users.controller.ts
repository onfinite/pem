import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
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
import type { UserProfileRow } from '../database/schemas';
import { ProfileService } from '../profile/profile.service';
import {
  CreateProfileFactDto,
  UpdateProfileFactDto,
} from './dto/profile-fact.dto';
import { PushTokenDto } from './dto/push-token.dto';
import { UserMeDto } from './dto/user-me.dto';
import { UserService } from './user.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(
    private readonly users: UserService,
    private readonly profile: ProfileService,
  ) {}

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
    };
  }

  @Get('me/profile')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({
    summary:
      'Facts Pem has saved for you. Use ?limit=&cursor= for pagination (newest first).',
  })
  async getProfileFacts(
    @CurrentUser() user: UserRow,
    @Query('limit') limitRaw?: string,
    @Query('cursor') cursor?: string,
  ) {
    const hasLimit =
      limitRaw !== undefined &&
      limitRaw !== '' &&
      !Number.isNaN(Number(limitRaw));
    if (hasLimit) {
      const limit = Math.min(Math.max(Number(limitRaw), 1), 50);
      const { rows, nextCursor } = await this.profile.listFactsPaginated(
        user.id,
        limit,
        cursor || undefined,
      );
      return {
        facts: rows.map((r) => this.serializeFact(r)),
        next_cursor: nextCursor,
      };
    }
    const rows = await this.profile.listFacts(user.id);
    return {
      facts: rows.map((r) => this.serializeFact(r)),
    };
  }

  @Post('me/profile')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Add a profile fact (user-edited)' })
  async createProfileFact(
    @CurrentUser() user: UserRow,
    @Body() body: CreateProfileFactDto,
  ) {
    const row = await this.profile.createUserFact(
      user.id,
      body.key,
      body.value,
    );
    return { fact: this.serializeFact(row) };
  }

  @Patch('me/profile/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @ApiOperation({ summary: 'Update a profile fact' })
  async updateProfileFact(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
    @Body() body: UpdateProfileFactDto,
  ) {
    if (body.key === undefined && body.value === undefined) {
      throw new BadRequestException('Provide at least key or value to update');
    }
    const row = await this.profile.updateUserFact(user.id, id, {
      key: body.key,
      value: body.value,
    });
    return { fact: this.serializeFact(row) };
  }

  @Delete('me/profile/:id')
  @UseGuards(ClerkAuthGuard)
  @ApiBearerAuth('clerk')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a profile fact' })
  async deleteProfileFact(
    @CurrentUser() user: UserRow,
    @Param('id', new ParseUUIDPipe({ version: '4' })) id: string,
  ): Promise<void> {
    await this.profile.deleteUserFact(user.id, id);
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

  private serializeFact(r: UserProfileRow) {
    return {
      id: r.id,
      key: r.key,
      value: r.value,
      source: r.source,
      updated_at: r.updatedAt?.toISOString?.() ?? r.updatedAt,
    };
  }
}
